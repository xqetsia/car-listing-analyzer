// ============================================================
// CONFIG
// GEMINI_API_KEY comes from config.js (gitignored, loaded via a
// separate <script> tag in index.html before this file). This
// keeps the key out of your Git repo. It's still visible to
// anyone who views this site's source once it's live — that's
// unavoidable on a backend-less static site — so keep the key's
// quota low and rotate/revoke it after your demo.
// ============================================================
const MODEL = "gemini-3.6-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";

// ============================================================
// Schema the model must fill in
// ============================================================
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    extracted_details: {
      type: "object",
      properties: {
        year: { type: "string", description: "Model year, or 'Unknown'" },
        make: { type: "string" },
        model: { type: "string" },
        mileage: { type: "string", description: "e.g. '89,000 mi', or 'Not listed'" },
        price: { type: "string", description: "e.g. '$11,500', or 'Not listed'" },
        title_status: { type: "string", description: "e.g. 'Clean', 'Salvage', 'Not mentioned'" }
      },
      required: ["year", "make", "model", "mileage", "price", "title_status"]
    },
    red_flags: {
      type: "array",
      items: { type: "string" },
      description: "Concerning phrases, missing info, scam patterns, or condition issues. Empty array if none found."
    },
    positive_signals: {
      type: "array",
      items: { type: "string" },
      description: "Things that check out or work in the buyer's favor. Empty array if none found."
    },
    deal_score: {
      type: "integer",
      description: "1 (bad deal / avoid) to 10 (excellent deal), based on price vs. condition vs. transparency"
    },
    summary: {
      type: "string",
      description: "2-3 sentence plain-language verdict for the buyer"
    },
    image_urls: {
      type: "array",
      items: { type: "string" },
      description: "Direct URLs to the listing's photos, largest/full-size version available (not tiny thumbnails), in the order they appear on the page. Empty array if the listing has no photos or none could be found."
    }
  },
  required: ["extracted_details", "red_flags", "positive_signals", "deal_score", "summary", "image_urls"]
};

// ============================================================
// DOM refs
// ============================================================
const modeUrlBtn = document.getElementById("modeUrlBtn");
const modeTextBtn = document.getElementById("modeTextBtn");
const urlField = document.getElementById("urlField");
const textField = document.getElementById("textField");
const urlInput = document.getElementById("urlInput");
const textInput = document.getElementById("textInput");
const runBtn = document.getElementById("runBtn");
const errorMsg = document.getElementById("errorMsg");
const results = document.getElementById("results");
const reportNo = document.getElementById("reportNo");

const carousel = document.getElementById("carousel");
const carouselImg = document.getElementById("carouselImg");
const carouselPrev = document.getElementById("carouselPrev");
const carouselNext = document.getElementById("carouselNext");
const carouselCount = document.getElementById("carouselCount");
const carouselDots = document.getElementById("carouselDots");

let mode = "url";
let carouselImages = [];
let carouselIndex = 0;

// ============================================================
// Mode toggle
// ============================================================
function setMode(next) {
  mode = next;
  const isUrl = mode === "url";
  modeUrlBtn.classList.toggle("is-active", isUrl);
  modeTextBtn.classList.toggle("is-active", !isUrl);
  modeUrlBtn.setAttribute("aria-selected", String(isUrl));
  modeTextBtn.setAttribute("aria-selected", String(!isUrl));
  urlField.classList.toggle("is-hidden", !isUrl);
  textField.classList.toggle("is-hidden", isUrl);
  hideError();
}

modeUrlBtn.addEventListener("click", () => setMode("url"));
modeTextBtn.addEventListener("click", () => setMode("text"));

// ============================================================
// Report number — cosmetic, just for the inspection-report feel
// ============================================================
reportNo.textContent = "NO. " + String(Math.floor(100000 + Math.random() * 899999));

// ============================================================
// Error helpers
// ============================================================
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("is-hidden");
}
function hideError() {
  errorMsg.classList.add("is-hidden");
}

// ============================================================
// Build the request body for either mode
// ============================================================
function buildRequestBody(value) {
  const basePrompt = `You are inspecting a used car listing for a prospective buyer. Read the listing carefully and:
- Extract the key facts (year, make, model, mileage, price, title status). If something isn't stated, say so rather than guessing.
- Identify red flags: vague descriptions, missing history/title info, suspicious pricing (too good to be true), pressure tactics, common used-car scam phrasing, or condition concerns.
- Identify positive signals: things that build buyer confidence (clean title, documented maintenance, reasonable pricing, detailed condition disclosure, etc).
- Give a deal_score from 1-10 weighing price, condition, and transparency together.
- Write a short, plain-language summary a non-expert buyer can act on.
- If the listing page includes photos, pull out their direct image URLs (largest size available, not thumbnails) in image_urls. If you can't find any usable image URLs, return an empty array — don't invent or guess URLs.`;

  const body = {
    model: MODEL,
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: RESPONSE_SCHEMA
    }
  };

  if (mode === "url") {
    body.input = `${basePrompt}\n\nThe listing is at this URL: ${value}`;
    body.tools = [{ type: "url_context" }];
  } else {
    body.input = `${basePrompt}\n\nListing text:\n"""\n${value}\n"""`;
  }

  return body;
}

// ============================================================
// Extract the JSON text out of the Interactions API steps array
// ============================================================
function extractOutputText(interaction) {
  if (interaction.output_text) return interaction.output_text;

  const steps = interaction.steps || [];
  for (const step of steps) {
    if (step.type === "model_output" && Array.isArray(step.content)) {
      const textBlock = step.content.find((c) => c.type === "text");
      if (textBlock) return textBlock.text;
    }
  }
  throw new Error("No text output found in response.");
}

// ============================================================
// Carousel — shows listing photos when the model finds any.
// Broken images (hotlink-blocked, expired, etc.) are silently
// dropped rather than shown as broken-image icons.
// ============================================================
function setupCarousel(urls) {
  carouselImages = Array.isArray(urls) ? urls.filter(Boolean) : [];
  carouselIndex = 0;

  if (carouselImages.length === 0) {
    carousel.classList.add("is-hidden");
    return;
  }

  carousel.classList.remove("is-hidden");
  renderCarouselDots();
  showCarouselImage(0);
}

function renderCarouselDots() {
  carouselDots.innerHTML = "";
  if (carouselImages.length <= 1) return;
  carouselImages.forEach((_, i) => {
    const dot = document.createElement("button");
    dot.className = "carousel__dot";
    dot.setAttribute("aria-label", `Photo ${i + 1}`);
    dot.addEventListener("click", () => showCarouselImage(i));
    carouselDots.appendChild(dot);
  });
}

function showCarouselImage(index) {
  if (carouselImages.length === 0) {
    carousel.classList.add("is-hidden");
    return;
  }
  carouselIndex = (index + carouselImages.length) % carouselImages.length;
  carouselImg.src = carouselImages[carouselIndex];
  carouselCount.textContent = `${carouselIndex + 1} / ${carouselImages.length}`;

  [...carouselDots.children].forEach((dot, i) => {
    dot.classList.toggle("is-active", i === carouselIndex);
  });
}

// If a photo URL fails to load (hotlink protection, expired link,
// bad extraction), drop it from the set and move on.
carouselImg.addEventListener("error", () => {
  if (carouselImages.length === 0) return;
  carouselImages.splice(carouselIndex, 1);
  if (carouselImages.length === 0) {
    carousel.classList.add("is-hidden");
    return;
  }
  renderCarouselDots();
  showCarouselImage(carouselIndex);
});

carouselPrev.addEventListener("click", () => showCarouselImage(carouselIndex - 1));
carouselNext.addEventListener("click", () => showCarouselImage(carouselIndex + 1));

// ============================================================
// Render results
// ============================================================
function renderResults(data) {
  setupCarousel(data.image_urls);

  // Deal meter: score 1-10 → needle angle -90deg (bad) to +90deg (good)
  const score = Math.max(1, Math.min(10, Number(data.deal_score) || 1));
  const angle = -90 + ((score - 1) / 9) * 180;
  document.getElementById("meterNeedle").style.transform = `rotate(${angle}deg)`;
  document.getElementById("scoreNum").textContent = score;

  // Spec grid
  const specs = data.extracted_details || {};
  const specOrder = [
    ["Year", specs.year],
    ["Make", specs.make],
    ["Model", specs.model],
    ["Mileage", specs.mileage],
    ["Price", specs.price],
    ["Title", specs.title_status]
  ];
  const specGrid = document.getElementById("specGrid");
  specGrid.innerHTML = "";
  specOrder.forEach(([label, value]) => {
    const el = document.createElement("div");
    el.className = "spec";
    el.innerHTML = `<span class="spec__label">${label}</span><span class="spec__value">${escapeHtml(value || "—")}</span>`;
    specGrid.appendChild(el);
  });

  // Red flags / positive signals
  fillList("redFlagsList", data.red_flags, "No red flags surfaced.");
  fillList("goodSignalsList", data.positive_signals, "Nothing stood out yet.");

  // Summary
  document.getElementById("summaryText").textContent = data.summary || "";

  results.classList.remove("is-hidden");
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function fillList(id, items, emptyText) {
  const listEl = document.getElementById(id);
  listEl.innerHTML = "";
  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "finding-list__empty";
    li.textContent = emptyText;
    listEl.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    listEl.appendChild(li);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = String(str);
  return div.innerHTML;
}

// ============================================================
// Main action
// ============================================================
async function runInspection() {
  hideError();

  const value = mode === "url" ? urlInput.value.trim() : textInput.value.trim();
  if (!value) {
    showError(mode === "url" ? "Paste a listing URL first." : "Paste some listing text first.");
    return;
  }
  if (mode === "url") {
    try {
      new URL(value);
    } catch {
      showError("That doesn't look like a valid URL.");
      return;
    }
  }
  if (typeof GEMINI_API_KEY === "undefined" || GEMINI_API_KEY === "YOUR_API_KEY_HERE") {
    showError("Add your Gemini API key to config.js before running this.");
    return;
  }

  setLoading(true);

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY
      },
      body: JSON.stringify(buildRequestBody(value))
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`API error ${res.status}: ${errBody.slice(0, 200)}`);
    }

    const interaction = await res.json();
    const rawText = extractOutputText(interaction);
    const data = JSON.parse(rawText);
    console.log("Parsed response from Gemini:", data);
    renderResults(data);
  } catch (err) {
    console.error(err);
    if (mode === "url") {
      showError("Couldn't read that link. It may be private or blocked. Try the \"Pasted text\" option instead.");
    } else {
      showError("Something went wrong analyzing that listing. Check the console for details and try again.");
    }
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  runBtn.disabled = isLoading;
  runBtn.classList.toggle("is-loading", isLoading);
}

runBtn.addEventListener("click", runInspection);