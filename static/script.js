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
const modeImageBtn = document.getElementById("modeImageBtn");
const urlField = document.getElementById("urlField");
const textField = document.getElementById("textField");
const imageField = document.getElementById("imageField");
const urlInput = document.getElementById("urlInput");
const textInput = document.getElementById("textInput");
const imageInput = document.getElementById("imageInput");
const imageDrop = document.getElementById("imageDrop");
const imageGrid = document.getElementById("imageGrid");
const imageDropPlaceholder = document.getElementById("imageDropPlaceholder");
const imageClearAllBtn = document.getElementById("imageClearAllBtn");
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

// Screenshot mode state — a list of { dataUrl } objects, one per
// screenshot. dataUrl is the full "data:image/png;base64,iVBORw0K..."
// string; parsed apart into mime type + base64 payload at submit time.
let images = [];

const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB per screenshot
const MAX_IMAGES = 6; // per inspection

// ============================================================
// Mode toggle
// ============================================================
function setMode(next) {
  if (next === mode) return; // re-clicking the active tab shouldn't clear anything

  mode = next;
  const isUrl = mode === "url";
  const isText = mode === "text";
  const isImage = mode === "image";

  modeUrlBtn.classList.toggle("is-active", isUrl);
  modeTextBtn.classList.toggle("is-active", isText);
  modeImageBtn.classList.toggle("is-active", isImage);
  modeUrlBtn.setAttribute("aria-selected", String(isUrl));
  modeTextBtn.setAttribute("aria-selected", String(isText));
  modeImageBtn.setAttribute("aria-selected", String(isImage));

  urlField.classList.toggle("is-hidden", !isUrl);
  textField.classList.toggle("is-hidden", !isText);
  imageField.classList.toggle("is-hidden", !isImage);

  // Switching input source — clear whatever was entered/found under the
  // previous one, including any report still on screen, so nothing stale
  // carries over between sources.
  urlInput.value = "";
  textInput.value = "";
  clearImages();
  results.classList.add("is-hidden");
  setupCarousel([]);

  hideError();
}

modeUrlBtn.addEventListener("click", () => setMode("url"));
modeTextBtn.addEventListener("click", () => setMode("text"));
modeImageBtn.addEventListener("click", () => setMode("image"));

// ============================================================
// Screenshot intake — click to browse, drag-and-drop, or paste.
// Supports multiple screenshots per listing (e.g. one for the
// header/price, one for the description, one for photos).
// ============================================================
function addImageFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f && f.type.startsWith("image/"));
  if (files.length === 0) return;

  const room = MAX_IMAGES - images.length;
  if (room <= 0) {
    showError(`You can add up to ${MAX_IMAGES} screenshots per inspection.`);
    return;
  }

  const toAdd = files.slice(0, room);
  if (files.length > toAdd.length) {
    showError(`Only added ${toAdd.length} — max ${MAX_IMAGES} screenshots per inspection.`);
  } else {
    hideError();
  }

  toAdd.forEach(readAndAddImage);
}

const MAX_IMAGE_DIMENSION = 1600; // px, longest side
const IMAGE_JPEG_QUALITY = 0.8;

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = () => reject(new Error("read failed"));
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        const scale = MAX_IMAGE_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", IMAGE_JPEG_QUALITY));
    };
    img.onerror = () => reject(new Error("decode failed"));
    reader.readAsDataURL(file);
  });
}

function readAndAddImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    showError("Screenshots must be PNG, JPEG, or WEBP images.");
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    showError("One of those images is too large — screenshots must be under 8 MB each.");
    return;
  }

  resizeImage(file)
    .then((dataUrl) => {
      images.push({ dataUrl });
      renderImageGrid();
    })
    .catch(() => showError("Couldn't read one of those files — try again."));
}

function removeImageAt(index) {
  images.splice(index, 1);
  renderImageGrid();
}

function clearImages() {
  images = [];
  imageInput.value = "";
  renderImageGrid();
}

function renderImageGrid() {
  imageGrid.innerHTML = "";

  const hasImages = images.length > 0;
  imageGrid.classList.toggle("is-hidden", !hasImages);
  imageDropPlaceholder.classList.toggle("is-hidden", hasImages);
  imageClearAllBtn.classList.toggle("is-hidden", !hasImages);

  images.forEach((img, i) => {
    const thumb = document.createElement("div");
    thumb.className = "image-thumb";

    const thumbImg = document.createElement("img");
    thumbImg.src = img.dataUrl;
    thumbImg.alt = `Screenshot ${i + 1}`;
    thumb.appendChild(thumbImg);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "image-thumb__remove";
    removeBtn.setAttribute("aria-label", `Remove screenshot ${i + 1}`);
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeImageAt(i);
    });
    thumb.appendChild(removeBtn);

    imageGrid.appendChild(thumb);
  });
}

imageDrop.addEventListener("click", () => imageInput.click());
imageDrop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    imageInput.click();
  }
});

imageInput.addEventListener("change", () => {
  addImageFiles(imageInput.files);
  imageInput.value = ""; // allow re-selecting the same file(s) later
});

imageClearAllBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  clearImages();
});

["dragenter", "dragover"].forEach((evt) => {
  imageDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    imageDrop.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((evt) => {
  imageDrop.addEventListener(evt, (e) => {
    e.preventDefault();
    imageDrop.classList.remove("is-dragover");
  });
});

imageDrop.addEventListener("drop", (e) => {
  addImageFiles(e.dataTransfer.files);
});

// Paste one or more screenshots straight from the clipboard while in
// screenshot mode.
window.addEventListener("paste", (e) => {
  if (mode !== "image") return;
  const items = (e.clipboardData || window.clipboardData)?.items;
  if (!items) return;

  const files = [];
  for (const item of items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length > 0) {
    e.preventDefault();
    addImageFiles(files);
  }
});

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

  let requestBody;

  if (mode === "image") {
    if (images.length === 0) {
      showError("Add at least one screenshot first.");
      return;
    }
    // Each dataUrl looks like "data:image/png;base64,iVBORw0K..."
    const parsedImages = [];
    for (const img of images) {
      const match = /^data:([^;]+);base64,(.*)$/s.exec(img.dataUrl);
      if (!match) {
        showError("Couldn't read one of those screenshots — try re-adding it.");
        return;
      }
      parsedImages.push({ mimeType: match[1], value: match[2] });
    }
    requestBody = { mode, images: parsedImages };
  } else {
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
    requestBody = { mode, value };
  }

  setLoading(true);

  try {
    const res = await fetch(ANALYZE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
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
    } else if (mode === "image") {
      showError("Something went wrong reading that screenshot. Check the console for details and try again.");
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
