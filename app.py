import os
import sqlite3
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, render_template
from google import genai
from google.genai import types

DATABASE = "chatbot.db"

SYSTEM_PROMPT = (
    "You are a helpful, knowledgeable, and friendly AI assistant. "
    "Answer questions clearly and thoroughly. Be concise when possible "
    "but detailed when needed. Use markdown formatting when it improves readability."
)


def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key-change-in-prod")

    # Gemini client (initialised once per worker)
    gemini_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY", ""))

    def get_db():
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db():
        with get_db() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id          TEXT PRIMARY KEY,
                    title       TEXT NOT NULL DEFAULT 'New Chat',
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role            TEXT NOT NULL,
                    content         TEXT NOT NULL,
                    created_at      TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
                );
            """)

    init_db()

    # ── Routes ────────────────────────────────────────────────────────

    @app.route("/")
    def index():
        return render_template("index.html")

    @app.route("/api/conversations", methods=["GET"])
    def list_conversations():
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50"
            ).fetchall()
        return jsonify([dict(r) for r in rows])

    @app.route("/api/conversations", methods=["POST"])
    def create_conversation():
        conv_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()
        with get_db() as conn:
            conn.execute(
                "INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (conv_id, "New Chat", now, now),
            )
        return jsonify({"id": conv_id, "title": "New Chat", "created_at": now, "updated_at": now})

    @app.route("/api/conversations/<conv_id>", methods=["DELETE"])
    def delete_conversation(conv_id):
        with get_db() as conn:
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conv_id,))
            conn.execute("DELETE FROM conversations WHERE id = ?", (conv_id,))
        return jsonify({"success": True})

    @app.route("/api/conversations/<conv_id>/messages", methods=["GET"])
    def get_messages(conv_id):
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at",
                (conv_id,),
            ).fetchall()
        return jsonify([dict(r) for r in rows])

    @app.route("/api/conversations/<conv_id>/messages", methods=["POST"])
    def send_message(conv_id):
        data = request.get_json()
        user_content = (data or {}).get("content", "").strip()
        if not user_content:
            return jsonify({"error": "Message content is required"}), 400

        now = datetime.utcnow().isoformat()

        # Persist user message and fetch full history
        with get_db() as conn:
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (conv_id, "user", user_content, now),
            )
            history = conn.execute(
                "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at",
                (conv_id,),
            ).fetchall()

        # Build google-genai Contents list
        # Roles: "user" / "model"  (Gemini doesn't use "assistant")
        contents = []
        for row in history:
            role = "model" if row["role"] == "assistant" else "user"
            contents.append(types.Content(role=role, parts=[types.Part(text=row["content"])]))

        try:
            response = gemini_client.models.generate_content(
                model="gemini-2.5-flash-preview-04-17",
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    max_output_tokens=1024,
                ),
            )
            assistant_content = response.text
        except Exception as e:
            return jsonify({"error": f"AI service error: {str(e)}"}), 500

        reply_time = datetime.utcnow().isoformat()
        with get_db() as conn:
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (conv_id, "assistant", assistant_content, reply_time),
            )
            conv = conn.execute(
                "SELECT title FROM conversations WHERE id = ?", (conv_id,)
            ).fetchone()
            if conv and conv["title"] == "New Chat":
                title = user_content[:50] + ("..." if len(user_content) > 50 else "")
                conn.execute(
                    "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?",
                    (title, reply_time, conv_id),
                )
            else:
                conn.execute(
                    "UPDATE conversations SET updated_at = ? WHERE id = ?",
                    (reply_time, conv_id),
                )

        return jsonify({"role": "assistant", "content": assistant_content, "created_at": reply_time})

    return app


if __name__ == "__main__":
    app = create_app()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
