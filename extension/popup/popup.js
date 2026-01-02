/**
 * AlphaDrop - Modern Popup UI
 */

// DOM Elements
const elements = {
  app: document.querySelector(".app"),
  emptyState: document.getElementById("empty-state"),
  mainContent: document.getElementById("main-content"),
  originalImage: document.getElementById("original-image"),
  resultImage: document.getElementById("result-image"),
  originalFrame: document.getElementById("original-frame"),
  resultFrame: document.getElementById("result-frame"),
  resultCard: document.getElementById("result-card"),
  loadingCard: document.getElementById("loading-card"),
  progressCircle: document.getElementById("progress-circle"),
  statusDot: document.getElementById("status-dot"),
  methodPills: document.querySelectorAll(".method-pill"),
  processBtn: document.getElementById("process-btn"),
  downloadBtn: document.getElementById("download-btn"),
  downloadBtnRefine: document.getElementById("download-btn-refine"),
  refineBtn: document.getElementById("refine-btn"),
  // Inline controls switching
  mainControls: document.getElementById("main-controls"),
  refinementControls: document.getElementById("refinement-controls"),
  errorMessage: document.getElementById("error-message"),
  // Sliders
  featherSlider: document.getElementById("feather-slider"),
  featherValue: document.getElementById("feather-value"),
  edgeAdjustSlider: document.getElementById("edge-adjust-slider"),
  edgeAdjustValue: document.getElementById("edge-adjust-value"),
  smoothSlider: document.getElementById("smooth-slider"),
  smoothValue: document.getElementById("smooth-value"),
  resetRefinement: document.getElementById("reset-refinement"),
  // Lightbox
  lightbox: document.getElementById("lightbox"),
  lightboxContent: document.getElementById("lightbox-content"),
  lightboxImage: document.getElementById("lightbox-image"),
  lightboxLabel: document.getElementById("lightbox-label"),
  lightboxClose: document.getElementById("lightbox-close"),
  expandBtns: document.querySelectorAll(".expand-btn"),
};

// State
let state = {
  imageUrl: null,
  resultBase64: null,
  originalResultData: null,
  selectedMethod: "matting",
  isProcessing: false,
  isRefinementView: false,
};

// Progress animation state
const progressState = {
  target: 0,           // Target progress from backend (0-100)
  display: 0,          // Currently displayed progress (smoothly animated)
  animationId: null,   // requestAnimationFrame ID
  lastUpdate: 0,       // Timestamp of last backend update
  isAnimating: false,  // Whether animation loop is running
};

// Canvas for image processing
const processingCanvas = document.createElement("canvas");
const processingCtx = processingCanvas.getContext("2d", { willReadFrequently: true });

// Persistence constants
const STORAGE_KEY = "persistedSession";
const MAX_STORAGE_MB = 4; // Max combined size in MB

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  await checkApiStatus();
  await loadPersistedState(); // Try to restore previous session first
  await loadPendingImage();   // Then check for new image from context menu
  setupEventListeners();
  setupProgressListener();
});

// ============================================
// Persistence Functions
// ============================================

/**
 * Save current session to chrome.storage.local
 * Stores original image URL/base64 and result base64
 */
async function savePersistedState() {
  if (!state.imageUrl || !state.resultBase64) return;

  // Get original image as base64 if it's a URL
  let originalBase64 = elements.originalImage.src;

  // Calculate approximate size in MB
  const originalSize = originalBase64.length / 1024 / 1024;
  const resultSize = state.resultBase64.length / 1024 / 1024;
  const totalSize = originalSize + resultSize;

  if (totalSize > MAX_STORAGE_MB) {
    console.log(`AlphaDrop: Images too large to persist (${totalSize.toFixed(1)}MB > ${MAX_STORAGE_MB}MB)`);
    return;
  }

  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        originalImage: originalBase64,
        resultBase64: state.resultBase64,
        timestamp: Date.now(),
      }
    });
    console.log(`AlphaDrop: Session persisted (${totalSize.toFixed(1)}MB)`);
  } catch (error) {
    console.error("AlphaDrop: Failed to persist session:", error);
  }
}

/**
 * Load persisted session from chrome.storage.local
 */
async function loadPersistedState() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const session = stored[STORAGE_KEY];

    if (!session) return;

    // Check if session is less than 24 hours old
    const MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - session.timestamp > MAX_AGE) {
      await clearPersistedState();
      return;
    }

    // Restore the session
    state.imageUrl = session.originalImage;
    state.resultBase64 = session.resultBase64;

    // Update UI
    elements.emptyState.classList.add("hidden");
    elements.mainContent.classList.remove("hidden");
    elements.originalImage.src = session.originalImage;
    elements.resultImage.src = `data:image/png;base64,${session.resultBase64}`;
    elements.resultCard.classList.remove("hidden");
    elements.downloadBtn.classList.remove("hidden");
    elements.refineBtn.classList.remove("hidden");

    // Restore refinement data
    await storeOriginalResult(session.resultBase64);

    console.log("AlphaDrop: Session restored");
  } catch (error) {
    console.error("AlphaDrop: Failed to load persisted session:", error);
  }
}

/**
 * Clear persisted session
 */
async function clearPersistedState() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error("AlphaDrop: Failed to clear persisted session:", error);
  }
}

// Listen for progress updates from background script
function setupProgressListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PROGRESS_UPDATE") {
      setTargetProgress(message.progress);
    }
  });
}

// Set the target progress (from backend) - animation will smoothly catch up
function setTargetProgress(percent) {
  progressState.target = percent;
  progressState.lastUpdate = performance.now();

  // Start animation loop if not already running
  if (!progressState.isAnimating) {
    progressState.isAnimating = true;
    animateProgress();
  }
}

// Animation loop for smooth progress with drift
function animateProgress() {
  const now = performance.now();
  const timeSinceUpdate = now - progressState.lastUpdate;

  // Calculate how much to move toward target
  const diff = progressState.target - progressState.display;

  if (Math.abs(diff) > 0.1) {
    // Smooth interpolation toward target (ease-out feel)
    // Move faster when far from target, slower when close
    const speed = Math.max(0.08, Math.min(0.2, Math.abs(diff) / 100));
    progressState.display += diff * speed;
  } else if (progressState.target < 95 && timeSinceUpdate > 300) {
    // Drift: slowly creep forward during stalls, but never exceed target
    // This prevents the "frozen" feeling
    const driftAmount = 0.02; // Very slow drift
    const maxDrift = progressState.target - 1; // Never exceed target - 1
    progressState.display = Math.min(progressState.display + driftAmount, maxDrift);
  }

  // Update the visual progress ring
  renderProgress(progressState.display);

  // Continue animation if still processing
  if (state.isProcessing && progressState.display < 100) {
    progressState.animationId = requestAnimationFrame(animateProgress);
  } else {
    progressState.isAnimating = false;
  }
}

// Render the progress ring (direct DOM update)
function renderProgress(percent) {
  const circumference = 97.4;
  const offset = circumference - (percent / 100) * circumference;

  if (elements.progressCircle) {
    elements.progressCircle.style.strokeDashoffset = offset;
  }
}

// Reset progress to 0
function resetProgress() {
  progressState.target = 0;
  progressState.display = 0;
  progressState.lastUpdate = performance.now();
  progressState.isAnimating = false;

  if (progressState.animationId) {
    cancelAnimationFrame(progressState.animationId);
    progressState.animationId = null;
  }

  renderProgress(0);
}

// Stop progress animation
function stopProgressAnimation() {
  progressState.isAnimating = false;
  if (progressState.animationId) {
    cancelAnimationFrame(progressState.animationId);
    progressState.animationId = null;
  }
}

function setupEventListeners() {
  // Method pill selection
  elements.methodPills.forEach((pill) => {
    pill.addEventListener("click", () => selectMethod(pill.dataset.method));
  });

  // Main actions
  elements.processBtn.addEventListener("click", handleProcess);
  elements.downloadBtn.addEventListener("click", handleDownload);
  elements.downloadBtnRefine.addEventListener("click", handleDownload);

  // Refinement view toggle (click to toggle between views)
  elements.refineBtn.addEventListener("click", toggleRefinementView);
  elements.resetRefinement.addEventListener("click", resetRefinement);

  // Sliders - use input for real-time smooth updates
  const sliders = [elements.featherSlider, elements.edgeAdjustSlider, elements.smoothSlider];
  sliders.forEach(slider => {
    slider.addEventListener("input", handleSliderChange);
    // Initialize slider progress
    updateSliderProgress(slider);
  });

  // Lightbox
  elements.expandBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openLightbox(btn.dataset.target);
    });
  });
  elements.lightboxClose.addEventListener("click", closeLightbox);
  elements.lightbox.addEventListener("click", (e) => {
    if (e.target === elements.lightbox) closeLightbox();
  });

  // Close lightbox with Escape key
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (elements.lightbox.classList.contains("active")) {
        closeLightbox();
      }
    }
  });
}

// API Status
async function checkApiStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "CHECK_API" });
    if (response.success) {
      elements.statusDot.classList.add("connected");
      elements.statusDot.title = "API Connected";
    } else {
      throw new Error();
    }
  } catch {
    elements.statusDot.classList.add("error");
    elements.statusDot.title = "API Unavailable";
  }
}

// Load pending image from context menu
async function loadPendingImage() {
  const stored = await chrome.storage.local.get("pendingImage");
  if (stored.pendingImage) {
    const { url, timestamp } = stored.pendingImage;
    if (Date.now() - timestamp < 30000) {
      await loadImage(url);
    }
    await chrome.storage.local.remove("pendingImage");
  }
}

// Load image
async function loadImage(url) {
  state.imageUrl = url;
  state.resultBase64 = null;
  state.originalResultData = null;

  // Clear old persisted session when loading new image
  await clearPersistedState();

  elements.emptyState.classList.add("hidden");
  elements.mainContent.classList.remove("hidden");

  elements.originalImage.src = url;
  elements.originalImage.onerror = async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "FETCH_IMAGE",
        imageUrl: url,
      });
      if (response.success) {
        elements.originalImage.src = response.data;
      }
    } catch {
      showError("Failed to load image");
    }
  };

  // Reset UI
  elements.resultImage.src = "";
  elements.resultCard.classList.add("hidden");
  elements.loadingCard.classList.add("hidden");
  elements.downloadBtn.classList.add("hidden");
  elements.refineBtn.classList.add("hidden");
  hideError();
  showMainView();
}

// Method selection
function selectMethod(method) {
  state.selectedMethod = method;
  elements.methodPills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.method === method);
  });
}

// Process image
async function handleProcess() {
  if (state.isProcessing || !state.imageUrl) return;

  state.isProcessing = true;
  elements.processBtn.disabled = true;
  elements.resultCard.classList.add("hidden");
  elements.loadingCard.classList.remove("hidden");
  resetProgress();
  hideError();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "PROCESS_IMAGE",
      imageUrl: state.imageUrl,
      method: state.selectedMethod,
    });

    if (!response.success) {
      throw new Error(response.error || "Processing failed");
    }

    const result = response.data;

    // Display result
    state.resultBase64 = result.image;
    elements.resultImage.src = `data:image/png;base64,${result.image}`;

    // Store for refinement
    await storeOriginalResult(result.image);

    // Show result card and controls
    elements.resultCard.classList.remove("hidden");
    elements.downloadBtn.classList.remove("hidden");
    elements.refineBtn.classList.remove("hidden");

    // Persist session for next popup open
    await savePersistedState();
  } catch (error) {
    showError(error.message);
  } finally {
    state.isProcessing = false;
    elements.processBtn.disabled = false;
    elements.loadingCard.classList.add("hidden");
    stopProgressAnimation();
  }
}

// Download
function handleDownload() {
  if (!state.resultBase64) return;

  let dataUrl;
  if (processingCanvas.width > 0 && processingCanvas.height > 0) {
    dataUrl = processingCanvas.toDataURL("image/png");
  } else {
    dataUrl = `data:image/png;base64,${state.resultBase64}`;
  }

  const link = document.createElement("a");
  link.href = dataUrl;

  let filename = "alphadrop-result.png";
  try {
    const url = new URL(state.imageUrl);
    const name = url.pathname.split("/").pop();
    if (name) {
      filename = name.replace(/\.[^.]+$/, "") + "-no-bg.png";
    }
  } catch {}

  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Error handling
function showError(message) {
  elements.errorMessage.textContent = message;
  elements.errorMessage.classList.remove("hidden");
}

function hideError() {
  elements.errorMessage.classList.add("hidden");
}

// ============================================
// View Switching (Main <-> Refinement)
// ============================================

function toggleRefinementView() {
  state.isRefinementView = !state.isRefinementView;

  if (state.isRefinementView) {
    elements.mainControls.classList.add("hidden");
    elements.refinementControls.classList.remove("hidden");
    elements.refineBtn.classList.add("active");
  } else {
    elements.refinementControls.classList.add("hidden");
    elements.mainControls.classList.remove("hidden");
    elements.refineBtn.classList.remove("active");
  }
}

function showMainView() {
  state.isRefinementView = false;
  elements.refinementControls.classList.add("hidden");
  elements.mainControls.classList.remove("hidden");
  elements.refineBtn.classList.remove("active");
}

async function storeOriginalResult(base64) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      processingCanvas.width = img.width;
      processingCanvas.height = img.height;
      processingCtx.drawImage(img, 0, 0);
      state.originalResultData = processingCtx.getImageData(0, 0, img.width, img.height);
      resolve();
    };
    img.src = `data:image/png;base64,${base64}`;
  });
}

function resetRefinement() {
  elements.featherSlider.value = 0;
  elements.edgeAdjustSlider.value = 0;
  elements.smoothSlider.value = 0;
  updateSliderValues();

  // Update slider progress indicators
  updateSliderProgress(elements.featherSlider);
  updateSliderProgress(elements.edgeAdjustSlider);
  updateSliderProgress(elements.smoothSlider);

  if (state.originalResultData) {
    processingCtx.putImageData(state.originalResultData, 0, 0);
    elements.resultImage.src = processingCanvas.toDataURL("image/png");
  }
}

// Debounce for smooth slider updates
let refinementTimeout = null;

function handleSliderChange(e) {
  updateSliderValues();
  updateSliderProgress(e.target);

  // Debounce the heavy image processing for smoother feel
  if (refinementTimeout) {
    cancelAnimationFrame(refinementTimeout);
  }
  refinementTimeout = requestAnimationFrame(() => {
    applyRefinements();
  });
}

function updateSliderProgress(slider) {
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const value = parseFloat(slider.value);
  const progress = ((value - min) / (max - min)) * 100;
  slider.style.setProperty('--progress', `${progress}%`);
}

function updateSliderValues() {
  elements.featherValue.textContent = `${elements.featherSlider.value}px`;
  elements.edgeAdjustValue.textContent = `${elements.edgeAdjustSlider.value}px`;
  elements.smoothValue.textContent = elements.smoothSlider.value;

  // Update all slider progress indicators
  updateSliderProgress(elements.featherSlider);
  updateSliderProgress(elements.edgeAdjustSlider);
  updateSliderProgress(elements.smoothSlider);
}

function applyRefinements() {
  if (!state.originalResultData) return;

  const feather = parseInt(elements.featherSlider.value);
  const edgeAdjust = parseInt(elements.edgeAdjustSlider.value);
  const smooth = parseInt(elements.smoothSlider.value);

  const imageData = new ImageData(
    new Uint8ClampedArray(state.originalResultData.data),
    state.originalResultData.width,
    state.originalResultData.height
  );

  if (edgeAdjust !== 0) applyEdgeAdjust(imageData, edgeAdjust);
  if (feather > 0) applyFeather(imageData, feather);
  if (smooth > 0) applySmooth(imageData, smooth);

  processingCtx.putImageData(imageData, 0, 0);
  elements.resultImage.src = processingCanvas.toDataURL("image/png");
}

// ============================================
// Image Processing Functions
// ============================================

function applyFeather(imageData, radius) {
  const { data, width, height } = imageData;
  const alpha = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const isEdge = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = alpha[idx];
      if (a > 0 && a < 255) {
        isEdge[idx] = 1;
      } else {
        const neighbors = [alpha[idx - 1], alpha[idx + 1], alpha[idx - width], alpha[idx + width]];
        for (const n of neighbors) {
          if (Math.abs(a - n) > 10) {
            isEdge[idx] = 1;
            break;
          }
        }
      }
    }
  }

  const blurred = new Float32Array(alpha);
  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = y * width + x;
      let nearEdge = false;

      outer: for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (isEdge[(y + dy) * width + (x + dx)]) {
            nearEdge = true;
            break outer;
          }
        }
      }

      if (nearEdge) {
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            sum += alpha[(y + dy) * width + (x + dx)];
            count++;
          }
        }
        blurred[idx] = sum / count;
      }
    }
  }

  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 3] = Math.round(blurred[i]);
  }
}

function applyEdgeAdjust(imageData, amount) {
  const { data, width, height } = imageData;
  const iterations = Math.abs(amount);
  const erode = amount < 0;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      alpha[i] = data[i * 4 + 3];
    }

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const neighbors = [
          alpha[idx - width - 1], alpha[idx - width], alpha[idx - width + 1],
          alpha[idx - 1], alpha[idx], alpha[idx + 1],
          alpha[idx + width - 1], alpha[idx + width], alpha[idx + width + 1],
        ];
        data[idx * 4 + 3] = erode ? Math.min(...neighbors) : Math.max(...neighbors);
      }
    }
  }
}

function applySmooth(imageData, strength) {
  const { data, width, height } = imageData;
  const alpha = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const radius = Math.ceil(strength / 2);

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = y * width + x;
      const centerAlpha = alpha[idx];

      if (centerAlpha > 5 && centerAlpha < 250) {
        const neighbors = [];
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            neighbors.push(alpha[(y + dy) * width + (x + dx)]);
          }
        }
        neighbors.sort((a, b) => a - b);
        const median = neighbors[Math.floor(neighbors.length / 2)];
        const blend = strength / 10;
        data[idx * 4 + 3] = Math.round(centerAlpha * (1 - blend) + median * blend);
      }
    }
  }
}

// ============================================
// Lightbox Functions
// ============================================

function openLightbox(target) {
  let imgSrc = "";
  let label = "";
  let useCheckerboard = false;

  if (target === "original") {
    imgSrc = elements.originalImage.src;
    label = "Original Image";
    useCheckerboard = false;
  } else if (target === "result") {
    // Use current result (may have refinements applied)
    if (processingCanvas.width > 0 && processingCanvas.height > 0) {
      imgSrc = processingCanvas.toDataURL("image/png");
    } else {
      imgSrc = elements.resultImage.src;
    }
    label = "Result";
    useCheckerboard = true;
  }

  if (!imgSrc) return;

  elements.lightboxImage.src = imgSrc;
  elements.lightboxLabel.textContent = label;

  if (useCheckerboard) {
    elements.lightboxContent.classList.add("checkerboard");
  } else {
    elements.lightboxContent.classList.remove("checkerboard");
  }

  elements.lightbox.classList.add("active");
}

function closeLightbox() {
  elements.lightbox.classList.remove("active");
}
