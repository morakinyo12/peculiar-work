const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const DB_FILE = path.join(__dirname, 'files.json');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '[]', 'utf8');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = Date.now() + '-' + Math.random().toString(36).slice(2,8);
    const ext = path.extname(file.originalname);
    cb(null, id + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json());

function readDB(){
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8') || '[]'); }
  catch(e){ return []; }
}
function writeDB(arr){ fs.writeFileSync(DB_FILE, JSON.stringify(arr, null, 2), 'utf8'); }

app.get('/api/ping', (req,res)=>res.json({ok:true}));

app.post('/api/upload', upload.array('files'), (req,res)=>{
  const files = req.files || [];
  const db = readDB();
  const added = Date.now();
  const metas = files.map(f=>{
    const id = path.basename(f.filename, path.extname(f.filename));
    const meta = { id, name: f.originalname, size: f.size, type: f.mimetype, filename: f.filename, added };
    db.push(meta);
    return meta;
  });
  writeDB(db);
  res.json({ ok: true, files: metas });
});

app.get('/api/files', (req,res)=>{
  const db = readDB();
  res.json(db);
});

app.get('/api/files/:id/download', (req,res)=>{
  const id = req.params.id;
  const db = readDB();
  const item = db.find(i => i.id === id);
  if (!item) return res.status(404).json({ error: 'Not found' });
  const filepath = path.join(UPLOAD_DIR, item.filename);
  if (!fs.existsSync(filepath)) return res.status(410).json({ error: 'File missing on server' });
  res.download(filepath, item.name);
});

app.delete('/api/files/:id', (req,res)=>{
  const id = req.params.id;
  let db = readDB();
  const idx = db.findIndex(i => i.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const item = db[idx];
  const filepath = path.join(UPLOAD_DIR, item.filename);
  try { if (fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch(e){}
  db.splice(idx,1);
  writeDB(db);
  res.json({ ok:true });
});

// Serve static frontend when requested (optional)
app.use('/', express.static(__dirname));

const port = process.env.PORT || 3000;
app.listen(port, ()=>console.log('Server running on http://localhost:'+port));
