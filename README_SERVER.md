# File Organizer — Backend README

Run a minimal Node.js backend that accepts file uploads and serves downloads.

Install dependencies and start:

```bash
npm install
npm start
```

Server endpoints:
- `GET /api/ping` — health check
- `POST /api/upload` — multipart form upload (field name `files`)
- `GET /api/files` — list file metadata
- `GET /api/files/:id/download` — download file by id
- `DELETE /api/files/:id` — delete file

Uploaded files are stored in `/uploads` and metadata in `files.json`.
