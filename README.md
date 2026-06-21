# File Organizer (Frontend-only)

This is a client-side file organizer built with **HTML + CSS + vanilla JavaScript**.

## What persists?
- **File metadata** (name, size, type, timestamp) is stored in `localStorage`.

## What does NOT persist?
- **Actual file bytes** cannot be permanently stored in `localStorage` in a reliable way (and are subject to strict browser storage limits).
- File bytes are kept only in memory for the current session.

## Download behavior
- **Download works** immediately after upload (same session).
- **After refresh**, metadata remains but downloads are disabled because the original `File` objects are gone.

## Run
Open `index.html` in a browser.

