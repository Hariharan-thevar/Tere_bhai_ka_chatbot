# Orion AI Chatbot

A full-stack AI chatbot built with Flask, SQLite, and the Anthropic Claude API.

---

## Project Structure

```
chatbot/
├── app.py                  # Flask application (API + routing)
├── requirements.txt        # Python dependencies
├── Procfile                # Process command for Render
├── render.yaml             # Render deployment config
├── templates/
│   └── index.html          # Single-page frontend
└── static/
    ├── css/style.css       # Styles
    └── js/app.js           # Frontend logic
```

---

## Local Development

### 1. Clone / download the project

### 2. Create a virtual environment
```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
```

### 3. Install dependencies
```bash
pip install -r requirements.txt
```

### 4. Set your Anthropic API key
```bash
export ANTHROPIC_API_KEY="sk-ant-..."   # Mac/Linux
set ANTHROPIC_API_KEY=sk-ant-...        # Windows CMD
```
Get your key at https://console.anthropic.com

### 5. Run the server
```bash
python app.py
```
Open http://localhost:5000 in your browser.

---

## Deploy to Render

1. Push the project to a **GitHub repository**.
2. Go to [render.com](https://render.com) → **New Web Service** → connect your repo.
3. Render will detect `render.yaml` automatically. Confirm the settings.
4. In **Environment Variables**, add:
   - `ANTHROPIC_API_KEY` → your key from https://console.anthropic.com
5. Click **Deploy**. Render builds and starts your service in ~2 minutes.

> **Persistent storage**: The `render.yaml` mounts a 1 GB disk at `/data`.  
> Update `DATABASE` in `app.py` to `"/data/chatbot.db"` so data survives redeploys.

---

## Features

- Multi-conversation management with auto-generated titles
- Full conversation history sent to Claude on every message
- Markdown rendering (code blocks, tables, lists, etc.)
- Typing indicator while waiting for a response
- Mobile-responsive sidebar
- SQLite persistence across sessions
