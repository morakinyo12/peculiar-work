// Unified frontend script supporting local and backend file modes.

(function(){
  const LS_KEY = 'fileOrganizer.files.v2';
  const FILES_PER_PAGE = 6;
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  const fileMap = new Map();
  let currentPage = 1;
  let activeFiles = [];
  let serverMode = false;

  const el = id => document.getElementById(id);
  const previewList = el('previewList');
  const fileInput = el('fileInput');
  const chooseBtn = el('chooseBtn');
  const uploadBtn = el('uploadBtn');
  const heroUploadBtn = el('heroUploadBtn');
  const dropzone = el('dropzone');
  const searchInput = el('searchInput');
  const typeFilter = el('typeFilter');
  const filesGrid = el('filesGrid');
  const pagination = el('pagination');
  const uploadState = el('uploadState');
  const validationHint = el('validationHint');
  const serverStatus = el('serverStatus');
  const statTotalFiles = el('statTotalFiles');
  const statStorage = el('statStorage');
  const statRecent = el('statRecent');
  const statMode = el('statMode');
  const toast = el('toast');
  const toggleTheme = el('toggleTheme');
  const fileSearch = el('searchInput');

  let selectedFiles = [];

  function showToast(message, duration = 2500) {
    if(!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => toast.classList.remove('visible'), duration);
  }

  function formatBytes(bytes) {
    if (!Number.isFinite(bytes)) return '—';
    const units = ['B','KB','MB','GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
  }

  function getTypeCategory(type, name) {
    const ext = name.split('.').pop().toLowerCase();
    if (type.startsWith('image/') || ['png','jpg','jpeg','gif','svg'].includes(ext)) return 'image';
    if (type.startsWith('audio/') || ['mp3','wav','ogg'].includes(ext)) return 'audio';
    if (type.startsWith('video/') || ['mp4','mov','webm'].includes(ext)) return 'video';
    if (['zip','rar','7z','tar','gz'].includes(ext)) return 'archive';
    return 'document';
  }

  function getIcon(name, type) {
    const category = getTypeCategory(type, name);
    const map = {
      image: '🖼️',
      audio: '🎧',
      video: '🎬',
      archive: '🗜️',
      document: '📄'
    };
    return map[category] || '📄';
  }

  function readMetadata() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function writeMetadata(items) {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  }

  function buildPreview(files) {
    previewList.innerHTML = '';
    if (!files.length) {
      validationHint.textContent = 'No files selected.';
      return;
    }
    const frag = document.createDocumentFragment();
    let validCount = 0;

    files.forEach(file => {
      const row = document.createElement('div');
      row.className = 'preview-item';
      const info = document.createElement('div');
      info.className = 'preview-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'preview-name';
      nameEl.textContent = file.name;
      const metaEl = document.createElement('div');
      metaEl.className = 'preview-meta';
      metaEl.textContent = `${formatBytes(file.size)} • ${file.type || 'unknown'}`;
      info.append(nameEl, metaEl);
      const removeBtn = document.createElement('button');
      removeBtn.className = 'ghost-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', () => {
        selectedFiles = selectedFiles.filter(item => item !== file);
        buildPreview(selectedFiles);
      });
      row.append(info, removeBtn);
      frag.append(row);

      if (file.size <= MAX_FILE_SIZE) validCount++;
    });

    previewList.append(frag);
    validationHint.textContent = `${validCount}/${files.length} files valid and ready for upload.`;
  }

  function validateFiles(files) {
    const valid = [];
    const rejected = [];
    Array.from(files).forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
        rejected.push(`${file.name} (too large)`);
      } else {
        valid.push(file);
      }
    });
    return { valid, rejected };
  }

  function setStats(items) {
    const total = items.length;
    const storage = items.reduce((sum, item) => sum + (item.size || 0), 0);
    const recent = items.slice(-3).length;
    statTotalFiles.textContent = String(total);
    statStorage.textContent = formatBytes(storage);
    statRecent.textContent = String(recent);
  }

  async function detectServer() {
    try {
      const res = await fetch('/api/ping');
      if (res.ok) {
        serverMode = true;
        serverStatus.textContent = 'Backend mode';
        statMode.textContent = 'Server';
        showToast('Backend detected. Running in server mode.');
        return;
      }
    } catch {}
    serverMode = false;
    serverStatus.textContent = 'Local mode';
    statMode.textContent = 'Local';
    showToast('Backend unavailable. Running in browser-only mode.');
  }

  async function apiUpload(files) {
    const form = new FormData();
    Array.from(files).forEach(file => form.append('files', file));
    const res = await fetch('/api/upload', { method: 'POST', body: form });
    return res.ok ? await res.json() : null;
  }

  async function apiFetchFiles() {
    const res = await fetch('/api/files');
    return res.ok ? await res.json() : [];
  }

  async function apiDeleteFile(id) {
    const res = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    return res.ok;
  }

  function collectStoredFiles() {
    const stored = readMetadata();
    return stored.map(item => ({ ...item, category: getTypeCategory(item.type, item.name)}));
  }

  function addLocalFiles(files) {
    const meta = readMetadata();
    Array.from(files).forEach(file => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      meta.push({ id, name: file.name, size: file.size, type: file.type || 'unknown', added: Date.now() });
      fileMap.set(id, { file, url: URL.createObjectURL(file) });
    });
    writeMetadata(meta);
    showToast('Files added locally.');
    renderFileGrid();
  }

  async function uploadSelectedFiles() {
    if (!selectedFiles.length) {
      showToast('Please select files first.');
      return;
    }
    if (serverMode) {
      const result = await apiUpload(selectedFiles);
      if (result && result.files) {
        selectedFiles = [];
        previewList.innerHTML = '';
        validationHint.textContent = 'No files selected.';
        showToast('Upload complete.');
        renderFileGrid();
      } else {
        showToast('Server upload failed.');
      }
      return;
    }

    addLocalFiles(selectedFiles);
    selectedFiles = [];
    previewList.innerHTML = '';
    validationHint.textContent = 'No files selected.';
  }

  async function deleteFile(id) {
    if (serverMode) {
      if (!(await apiDeleteFile(id))) { showToast('Delete failed'); return; }
      showToast('File deleted.');
      renderFileGrid();
      return;
    }
    const meta = readMetadata().filter(item => item.id !== id);
    writeMetadata(meta);
    const mapItem = fileMap.get(id);
    if (mapItem) URL.revokeObjectURL(mapItem.url);
    fileMap.delete(id);
    showToast('File deleted.');
    renderFileGrid();
  }

  function createFileCard(item) {
    const card = document.createElement('article');
    card.className = 'file-card';
    const top = document.createElement('div');
    top.className = 'file-card__top';
    const icon = document.createElement('div');
    icon.className = 'file-icon';
    icon.textContent = getIcon(item.name, item.type);
    const title = document.createElement('div');
    title.className = 'file-name';
    title.textContent = item.name;
    top.append(icon, title);
    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.textContent = `${getTypeCategory(item.type, item.name)} • ${formatBytes(item.size)} • ${new Date(item.added || item.addedAt || Date.now()).toLocaleDateString()}`;
    const footer = document.createElement('div');
    footer.className = 'file-card__footer';
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'secondary-btn';
    downloadBtn.textContent = 'Download';
    downloadBtn.type = 'button';
    downloadBtn.addEventListener('click', () => {
      if (serverMode) window.open(`/api/files/${item.id}/download`, '_blank');
      else {
        const mapItem = fileMap.get(item.id);
        if (!mapItem) { showToast('File content unavailable after refresh.'); return; }
        const a = document.createElement('a');
        a.href = mapItem.url;
        a.download = item.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    });
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'ghost-btn';
    deleteBtn.textContent = 'Delete';
    deleteBtn.type = 'button';
    deleteBtn.addEventListener('click', () => {
      if (confirm(`Delete "${item.name}"?`)) deleteFile(item.id);
    });
    footer.append(downloadBtn, deleteBtn);
    card.append(top, meta, footer);
    return card;
  }

  function renderPagination(count) {
    pagination.innerHTML = '';
    const pages = Math.max(1, Math.ceil(count / FILES_PER_PAGE));
    for (let i = 1; i <= pages; i++) {
      const btn = document.createElement('button');
      btn.className = 'page-button' + (i === currentPage ? ' active' : '');
      btn.textContent = String(i);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        currentPage = i;
        renderFileGrid();
      });
      pagination.appendChild(btn);
    }
  }

  async function renderFileGrid() {
    const query = fileSearch.value.trim().toLowerCase();
    const category = typeFilter.value;
    const items = serverMode ? await apiFetchFiles() : collectStoredFiles();
    const filtered = items.filter(item => {
      const matchesName = item.name.toLowerCase().includes(query);
      const matchesType = category === 'all' || getTypeCategory(item.type, item.name) === category;
      return matchesName && matchesType;
    });
    activeFiles = filtered;
    currentPage = Math.min(currentPage, Math.max(1, Math.ceil(filtered.length / FILES_PER_PAGE)));
    const start = (currentPage - 1) * FILES_PER_PAGE;
    const pageItems = filtered.slice(start, start + FILES_PER_PAGE);
    filesGrid.innerHTML = '';
    if (!pageItems.length) {
      filesGrid.innerHTML = '<div class="empty-state">No files found.</div>';
    } else {
      pageItems.forEach(item => filesGrid.appendChild(createFileCard(item)));
    }
    renderPagination(filtered.length);
    setStats(items);
  }

  async function initialize() {
    await detectServer();
    renderFileGrid();
  }

  chooseBtn.addEventListener('click', () => fileInput.click());
  heroUploadBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', event => {
    const { valid, rejected } = validateFiles(event.target.files);
    selectedFiles = valid;
    buildPreview(valid);
    if (rejected.length) showToast(`Rejected: ${rejected.join(', ')}`);
  });

  uploadBtn.addEventListener('click', uploadSelectedFiles);

  ['dragenter','dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave','dragend','drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, event => {
      event.preventDefault();
      event.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });
  dropzone.addEventListener('drop', event => {
    const files = event.dataTransfer.files;
    const { valid, rejected } = validateFiles(files);
    selectedFiles = valid;
    buildPreview(valid);
    if (rejected.length) showToast(`Rejected: ${rejected.join(', ')}`);
  });

  searchInput.addEventListener('input', renderFileGrid);
  typeFilter.addEventListener('change', renderFileGrid);
  toggleTheme.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    toggleTheme.textContent = document.body.classList.contains('dark-mode') ? 'Light mode' : 'Dark mode';
  });

  document.addEventListener('DOMContentLoaded', initialize);
})();

