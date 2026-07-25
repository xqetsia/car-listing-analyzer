// ============================================================
// This file no longer talks to Gemini directly, and holds no
// API key at all. It calls our own Flask backend (/api/analyze),
// which holds the real key server-side.
// ============================================================
const ANALYZE_ENDPOINT = "/api/analyze";

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
// Carousel — shows listing photos when the backend finds any.
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

  const score = Math.max(1, Math.min(10, Number(data.deal_score) || 1));
  const angle = -90 + ((score - 1) / 9) * 180;
  document.getElementById("meterNeedle").style.transform = `rotate(${angle}deg)`;
  document.getElementById("scoreNum").textContent = score;

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

  fillList("redFlagsList", data.red_flags, "No red flags surfaced.");
  fillList("goodSignalsList", data.positive_signals, "Nothing stood out yet.");

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
// Main action — calls our own Flask backend
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

  setLoading(true);

  try {
    const res = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, value })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }

    console.log("Parsed response from backend:", data);
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
