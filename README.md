# Know Before You Buy — Car Listing Inspector

Paste a car listing link or its text, and get back a structured
inspection report: extracted details, red flags, positive signals, a
1–10 deal score, and a plain-language summary. Powered by the Gemini
API.

## How it works

- The Flask backend (`app.py`) holds the Gemini API key and calls the
  Interactions API's `client.interactions.create()`.
- For URL input, Gemini's built-in `url_context` tool fetches the
  listing page server-side (no scraping code needed, no CORS issues).
- For pasted text, the listing content goes straight into the prompt.
- A JSON schema forces a consistent, structured response every time
  (score, specs, flags, summary, photo URLs).
- The frontend (`static/script.js`) only talks to our own
  `/api/analyze` route — it never sees the Gemini API key.

## Project structure

```
car-listing-analyzer/
├── app.py                 # Flask app: serves the page, calls Gemini via /api/analyze
├── requirements.txt        # Python dependencies
├── .env                    # Real GEMINI_API_KEY (gitignored, you create this)
├── .gitignore
├── templates/
│   └── index.html          # Page markup (Jinja template)
└── static/
    ├── style.css           # Styling
    └── script.js           # Frontend logic — calls /api/analyze, renders the report
```

**Request flow:**

```
Browser (script.js)
     │
     │  POST /api/analyze  { mode, value }
     ▼
Flask (app.py)
     │
     │  client.interactions.create(model, input, tools, response_format)
     │  — GEMINI_API_KEY attached here, server-side only
     ▼
Gemini Interactions API
     │
     │  (url_context tool fetches the listing page, if mode = "url")
     ▼
Structured JSON response
     │
     ▼
Flask returns parsed JSON → Browser renders the report
```

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt --break-system-packages
   ```

2. Create a `.env` file in the project root (see `.env.example`):
   ```
   GEMINI_API_KEY=your-actual-key-here
   ```

3. Run the app:
   ```bash
   python3 app.py
   ```

4. Visit `http://localhost:5000`

## Notes

- Works best on public, login-free listings (Craigslist confirmed
  working; some sites like Cars.com block `url_context` outright — use
  the "Pasted text" mode as a fallback).
- Photo carousel only populates when Gemini can extract usable image
  URLs from the page — not guaranteed on every listing (see
  `notes-pain-points.md` for details on this limitation).
