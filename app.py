import os
import json
from functools import lru_cache
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai

load_dotenv()

app = Flask(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY not found. Add it to a .env file in this folder "
        "(see .env.example)."
    )

client = genai.Client(api_key=GEMINI_API_KEY)

MODEL = "gemini-3.6-flash"

BASE_PROMPT = """You are inspecting a car listing for a prospective buyer. Read the listing carefully and:
- Extract the key facts (year, make, model, mileage, price, title status). If something isn't stated, say so rather than guessing.
- Identify red flags: vague descriptions, missing history/title info, suspicious pricing (too good to be true), pressure tactics, common used-car scam phrasing, or condition concerns.
- Identify positive signals: things that build buyer confidence (clean title, documented maintenance, reasonable pricing, detailed condition disclosure, etc).
- Give a deal_score from 1-10 weighing price, condition, and transparency together.
- Write a short, plain-language summary a non-expert buyer can act on.
- If the listing page includes photos, pull out their direct image URLs (largest size available, not thumbnails) in image_urls. If you can't find any usable image URLs, return an empty array — don't invent or guess URLs."""

RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "extracted_details": {
            "type": "object",
            "properties": {
                "year": {"type": "string", "description": "Model year, or 'Unknown'"},
                "make": {"type": "string"},
                "model": {"type": "string"},
                "mileage": {"type": "string", "description": "e.g. '89,000 mi', or 'Not listed'"},
                "price": {"type": "string", "description": "e.g. '$11,500', or 'Not listed'"},
                "title_status": {"type": "string", "description": "e.g. 'Clean', 'Salvage', 'Not mentioned'"},
            },
            "required": ["year", "make", "model", "mileage", "price", "title_status"],
        },
        "red_flags": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Concerning phrases, missing info, scam patterns, or condition issues. Empty array if none found.",
        },
        "positive_signals": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Things that check out or work in the buyer's favor. Empty array if none found.",
        },
        "deal_score": {
            "type": "integer",
            "description": "1 (bad deal / avoid) to 10 (excellent deal), based on price vs. condition vs. transparency",
        },
        "summary": {
            "type": "string",
            "description": "2-3 sentence plain-language verdict for the buyer",
        },
        "image_urls": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Direct URLs to the listing's photos, largest/full-size version available, in the order they appear. Empty array if none found.",
        },
    },
    "required": [
        "extracted_details",
        "red_flags",
        "positive_signals",
        "deal_score",
        "summary",
        "image_urls",
    ],
}


def extract_output_text(interaction):
    """Pull the JSON text out of an Interactions API response,
    whether the SDK exposes .output_text or only the raw .steps."""
    output_text = getattr(interaction, "output_text", None)
    if output_text:
        return output_text

    for step in getattr(interaction, "steps", None) or []:
        if getattr(step, "type", None) == "model_output":
            for block in getattr(step, "content", None) or []:
                if getattr(block, "type", None) == "text":
                    return block.text

    raise ValueError("No text output found in Gemini response.")


@lru_cache(maxsize=256)
def _cached_gemini_call(model, input_key, kwargs_key):
    """Cache Gemini calls by (model, input, extra kwargs) so identical
    requests (same URL/text/screenshots) skip the round-trip."""
    input_content = json.loads(input_key)
    request_kwargs = json.loads(kwargs_key)
    interaction = client.interactions.create(
        model=model,
        input=input_content,
        response_format={
            "type": "text",
            "mime_type": "application/json",
            "schema": RESPONSE_SCHEMA,
        },
        **request_kwargs,
    )
    return extract_output_text(interaction)


@app.route("/")
def index():
    return render_template("index.html")


ALLOWED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp"}
MAX_IMAGES_PER_REQUEST = 6

IMAGE_MODE_NOTE = (
    "\n\nThe listing is shown in the attached screenshot(s), not a live "
    "webpage — read all visible text and details directly from the "
    "image(s) (title, price, mileage, description, condition notes). If "
    "there is more than one screenshot, they are different parts of the "
    "same listing (e.g. one for the header/price, one for the "
    "description, one for photos) — combine what you find across all of "
    "them into a single report rather than treating them as separate "
    "listings. You have no way to pull separate photo URLs from a "
    "screenshot, so always return image_urls as an empty array for this "
    "mode."
)


@app.route("/api/analyze", methods=["POST"])
def analyze():
    payload = request.get_json(silent=True) or {}
    mode = payload.get("mode")

    if mode not in ("url", "text", "image"):
        return jsonify({"error": "mode must be 'url', 'text', or 'image'"}), 400

    if mode == "image":
        images = payload.get("images")

        if not isinstance(images, list) or not images:
            return jsonify({"error": "images (a non-empty list) is required"}), 400
        if len(images) > MAX_IMAGES_PER_REQUEST:
            return jsonify({
                "error": f"Too many screenshots — max {MAX_IMAGES_PER_REQUEST} per inspection."
            }), 400

        input_content = [{"type": "text", "text": f"{BASE_PROMPT}{IMAGE_MODE_NOTE}"}]
        for i, image in enumerate(images):
            image_data = (image.get("value") or "").strip() if isinstance(image, dict) else ""
            mime_type = image.get("mimeType") or "" if isinstance(image, dict) else ""

            if not image_data:
                return jsonify({"error": f"Screenshot {i + 1} is missing image data"}), 400
            if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
                return jsonify({
                    "error": f"Screenshot {i + 1} has an unsupported type: "
                             f"{mime_type or 'unknown'}. Use PNG, JPEG, or WEBP."
                }), 400

            input_content.append({"type": "image", "data": image_data, "mime_type": mime_type})

        request_kwargs = {}
    else:
        value = (payload.get("value") or "").strip()
        if not value:
            return jsonify({"error": "value is required"}), 400

        if mode == "url":
            input_content = f"{BASE_PROMPT}\n\nThe listing is at this URL: {value}"
            request_kwargs = {"tools": [{"type": "url_context"}]}
        else:
            input_content = f'{BASE_PROMPT}\n\nListing text:\n"""\n{value}\n"""'
            request_kwargs = {}

    try:
        input_key = json.dumps(input_content, sort_keys=True)
        kwargs_key = json.dumps(request_kwargs, sort_keys=True)
        raw_text = _cached_gemini_call(MODEL, input_key, kwargs_key)
        result = json.loads(raw_text)
        return jsonify(result)
    except Exception as exc:  # noqa: BLE001 — surface any Gemini/parsing error to the client
        app.logger.exception("Gemini request failed")
        return jsonify({"error": str(exc)}), 502




if __name__ == "__main__":
    app.run(debug=True, port=5001, threaded=True)
