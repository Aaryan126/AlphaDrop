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
  eraserBtn: document.getElementById("eraser-btn"),
  // Eraser modal
  eraserModal: document.getElementById("eraser-modal"),
  eraserCanvas: document.getElementById("eraser-canvas"),
  eraserCanvasContainer: document.getElementById("eraser-canvas-container"),
  eraserCursor: document.getElementById("eraser-cursor"),
  eraserSize: document.getElementById("eraser-size"),
  eraserSizeValue: document.getElementById("eraser-size-value"),
  eraserClose: document.getElementById("eraser-close"),
  eraserReset: document.getElementById("eraser-reset"),
  eraserApply: document.getElementById("eraser-apply"),
  zoomIn: document.getElementById("zoom-in"),
  zoomOut: document.getElementById("zoom-out"),
  zoomFit: document.getElementById("zoom-fit"),
  zoomLevel: document.getElementById("zoom-level"),
  eraserWorkspace: document.querySelector(".eraser-workspace"),
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
  // Crop modal
  cropModal: document.getElementById("crop-modal"),
  cropImage: document.getElementById("crop-image"),
  cropImageContainer: document.getElementById("crop-image-container"),
  cropSelection: document.getElementById("crop-selection"),
  cropCancel: document.getElementById("crop-cancel"),
  cropReset: document.getElementById("crop-reset"),
  cropApply: document.getElementById("crop-apply"),
  cropBtns: document.querySelectorAll(".crop-btn"),
  cropHandles: document.querySelectorAll(".crop-handle"),
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
  setupCropEventListeners();
  setupEraserEventListeners();
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
    elements.resultFrame.classList.add("checkerboard");
    elements.downloadBtn.classList.remove("hidden");
    elements.refineBtn.classList.remove("hidden");
    elements.eraserBtn.classList.remove("hidden");

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
  // Only accept higher values to prevent flickering (progress never goes backward)
  if (percent > progressState.target) {
    progressState.target = percent;
    progressState.lastUpdate = performance.now();
  }

  // Start animation loop if not already running
  if (!progressState.isAnimating) {
    progressState.isAnimating = true;
    animateProgress();
  }
}

// Animation loop for smooth progress
function animateProgress() {
  const now = performance.now();
  const timeSinceUpdate = now - progressState.lastUpdate;

  // Calculate how much to move toward target (only forward)
  const diff = progressState.target - progressState.display;

  if (diff > 0.1) {
    // Smooth interpolation toward target (ease-out feel)
    // Constant speed for more predictable movement
    const speed = 0.12;
    const step = Math.max(0.5, diff * speed);
    progressState.display = Math.min(progressState.display + step, progressState.target);
  } else if (progressState.target < 95 && timeSinceUpdate > 500) {
    // Drift: slowly creep forward during stalls, but stay below target
    // This prevents the "frozen" feeling
    const maxDrift = Math.max(progressState.display, progressState.target - 2);
    if (progressState.display < maxDrift) {
      progressState.display += 0.03;
    }
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
  elements.resultFrame.classList.remove("checkerboard");
  elements.loadingCard.classList.add("hidden");
  elements.downloadBtn.classList.add("hidden");
  elements.refineBtn.classList.add("hidden");
  elements.eraserBtn.classList.add("hidden");
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
    elements.resultFrame.classList.add("checkerboard");
    elements.downloadBtn.classList.remove("hidden");
    elements.refineBtn.classList.remove("hidden");
    elements.eraserBtn.classList.remove("hidden");

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

// ============================================
// Crop Functions
// ============================================

// Crop state
const cropState = {
  target: null,        // 'original' or 'result'
  imageWidth: 0,       // Natural image dimensions
  imageHeight: 0,
  displayWidth: 0,     // Displayed image dimensions
  displayHeight: 0,
  selection: { x: 0, y: 0, width: 0, height: 0 },
  isDragging: false,
  dragType: null,      // 'move' or handle name
  dragStart: { x: 0, y: 0 },
  selectionStart: { x: 0, y: 0, width: 0, height: 0 },
};

function openCropModal(target) {
  cropState.target = target;

  let imgSrc = "";
  if (target === "original") {
    imgSrc = elements.originalImage.src;
  } else if (target === "result") {
    if (processingCanvas.width > 0 && processingCanvas.height > 0) {
      imgSrc = processingCanvas.toDataURL("image/png");
    } else {
      imgSrc = elements.resultImage.src;
    }
  }

  if (!imgSrc) return;

  elements.cropImage.src = imgSrc;
  elements.cropImage.onload = () => {
    // Get natural and display dimensions
    cropState.imageWidth = elements.cropImage.naturalWidth;
    cropState.imageHeight = elements.cropImage.naturalHeight;
    cropState.displayWidth = elements.cropImage.offsetWidth;
    cropState.displayHeight = elements.cropImage.offsetHeight;

    // Initialize selection to full image
    resetCropSelection();
  };

  elements.cropModal.classList.add("active");
}

function closeCropModal() {
  elements.cropModal.classList.remove("active");
  cropState.isDragging = false;
}

function resetCropSelection() {
  cropState.selection = {
    x: 0,
    y: 0,
    width: cropState.displayWidth,
    height: cropState.displayHeight,
  };
  updateCropSelectionUI();
}

function updateCropSelectionUI() {
  const sel = cropState.selection;
  elements.cropSelection.style.left = `${sel.x}px`;
  elements.cropSelection.style.top = `${sel.y}px`;
  elements.cropSelection.style.width = `${sel.width}px`;
  elements.cropSelection.style.height = `${sel.height}px`;
}

function handleCropMouseDown(e) {
  const target = e.target;

  if (target.classList.contains("crop-handle")) {
    cropState.isDragging = true;
    cropState.dragType = target.dataset.handle;
  } else if (target === elements.cropSelection || target.closest(".crop-selection")) {
    cropState.isDragging = true;
    cropState.dragType = "move";
  } else {
    return;
  }

  cropState.dragStart = { x: e.clientX, y: e.clientY };
  cropState.selectionStart = { ...cropState.selection };

  e.preventDefault();
}

function handleCropMouseMove(e) {
  if (!cropState.isDragging) return;

  const dx = e.clientX - cropState.dragStart.x;
  const dy = e.clientY - cropState.dragStart.y;
  const start = cropState.selectionStart;
  const minSize = 20;

  let newX = start.x;
  let newY = start.y;
  let newWidth = start.width;
  let newHeight = start.height;

  if (cropState.dragType === "move") {
    newX = Math.max(0, Math.min(cropState.displayWidth - start.width, start.x + dx));
    newY = Math.max(0, Math.min(cropState.displayHeight - start.height, start.y + dy));
  } else {
    const handle = cropState.dragType;

    // Handle horizontal resizing
    if (handle.includes("w")) {
      const maxDx = start.width - minSize;
      const clampedDx = Math.max(-start.x, Math.min(maxDx, dx));
      newX = start.x + clampedDx;
      newWidth = start.width - clampedDx;
    }
    if (handle.includes("e")) {
      newWidth = Math.max(minSize, Math.min(cropState.displayWidth - start.x, start.width + dx));
    }

    // Handle vertical resizing
    if (handle.includes("n")) {
      const maxDy = start.height - minSize;
      const clampedDy = Math.max(-start.y, Math.min(maxDy, dy));
      newY = start.y + clampedDy;
      newHeight = start.height - clampedDy;
    }
    if (handle.includes("s")) {
      newHeight = Math.max(minSize, Math.min(cropState.displayHeight - start.y, start.height + dy));
    }
  }

  cropState.selection = { x: newX, y: newY, width: newWidth, height: newHeight };
  updateCropSelectionUI();
}

function handleCropMouseUp() {
  cropState.isDragging = false;
  cropState.dragType = null;
}

function applyCrop() {
  const sel = cropState.selection;

  // Convert display coordinates to image coordinates
  const scaleX = cropState.imageWidth / cropState.displayWidth;
  const scaleY = cropState.imageHeight / cropState.displayHeight;

  const cropX = Math.round(sel.x * scaleX);
  const cropY = Math.round(sel.y * scaleY);
  const cropWidth = Math.round(sel.width * scaleX);
  const cropHeight = Math.round(sel.height * scaleY);

  // Create canvas for cropping
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const ctx = cropCanvas.getContext("2d");

  // Draw cropped region
  ctx.drawImage(
    elements.cropImage,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );

  const croppedDataUrl = cropCanvas.toDataURL("image/png");

  // Apply to appropriate target
  if (cropState.target === "original") {
    elements.originalImage.src = croppedDataUrl;
    state.imageUrl = croppedDataUrl;
  } else if (cropState.target === "result") {
    const base64 = croppedDataUrl.replace(/^data:image\/png;base64,/, "");
    state.resultBase64 = base64;
    elements.resultImage.src = croppedDataUrl;

    // Update processing canvas and originalResultData
    const img = new Image();
    img.onload = () => {
      processingCanvas.width = img.width;
      processingCanvas.height = img.height;
      processingCtx.drawImage(img, 0, 0);
      state.originalResultData = processingCtx.getImageData(0, 0, img.width, img.height);

      // Update persisted state
      savePersistedState();
    };
    img.src = croppedDataUrl;
  }

  closeCropModal();
}

function setupCropEventListeners() {
  // Open crop modal
  elements.cropBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCropModal(btn.dataset.target);
    });
  });

  // Crop modal controls
  elements.cropCancel.addEventListener("click", closeCropModal);
  elements.cropReset.addEventListener("click", resetCropSelection);
  elements.cropApply.addEventListener("click", applyCrop);

  // Drag events
  elements.cropImageContainer.addEventListener("mousedown", handleCropMouseDown);
  document.addEventListener("mousemove", handleCropMouseMove);
  document.addEventListener("mouseup", handleCropMouseUp);

  // Close on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.cropModal.classList.contains("active")) {
      closeCropModal();
    }
  });
}

// ============================================
// Eraser Modal Functions
// ============================================

const eraserState = {
  canvas: null,
  ctx: null,
  isDrawing: false,
  brushSize: 20,
  lastX: 0,
  lastY: 0,
  originalImageData: null,
  scale: 1,
  zoom: 1,
  minZoom: 0.25,
  maxZoom: 5,
  fitZoom: 1,
  baseCanvasWidth: 0,
  baseCanvasHeight: 0,
};

function openEraserModal() {
  if (processingCanvas.width === 0 || processingCanvas.height === 0) return;

  // Initialize eraser canvas with current result
  const canvas = elements.eraserCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  // Set canvas size to match the processing canvas
  canvas.width = processingCanvas.width;
  canvas.height = processingCanvas.height;

  // Store base dimensions
  eraserState.baseCanvasWidth = canvas.width;
  eraserState.baseCanvasHeight = canvas.height;

  // Draw current result onto eraser canvas
  ctx.drawImage(processingCanvas, 0, 0);

  // Store original for reset
  eraserState.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  eraserState.canvas = canvas;
  eraserState.ctx = ctx;

  elements.eraserModal.classList.add("active");

  // Calculate fit zoom after modal is visible
  requestAnimationFrame(() => {
    calculateFitZoom();
    setZoom(eraserState.fitZoom);
    updateEraserCursor();
  });
}

function closeEraserModal() {
  elements.eraserModal.classList.remove("active");
  eraserState.isDrawing = false;
  eraserState.zoom = 1;
  elements.eraserCanvas.style.width = "";
  elements.eraserCanvas.style.height = "";
}

function resetEraser() {
  if (eraserState.originalImageData && eraserState.ctx) {
    eraserState.ctx.putImageData(eraserState.originalImageData, 0, 0);
  }
}

function applyEraser() {
  if (!eraserState.canvas) return;

  // Copy eraser canvas to processing canvas
  processingCanvas.width = eraserState.canvas.width;
  processingCanvas.height = eraserState.canvas.height;
  processingCtx.drawImage(eraserState.canvas, 0, 0);

  // Update result image
  elements.resultImage.src = processingCanvas.toDataURL("image/png");

  // Update state
  state.resultBase64 = processingCanvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  state.originalResultData = processingCtx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);

  // Save
  savePersistedState();

  closeEraserModal();
}

function updateEraserCursor() {
  const size = parseInt(elements.eraserSize.value);
  eraserState.brushSize = size;
  elements.eraserSizeValue.textContent = `${size}px`;

  // Cursor uses fixed positioning, so multiply by zoom for visual size
  const visualSize = size * eraserState.zoom;
  elements.eraserCursor.style.width = `${visualSize}px`;
  elements.eraserCursor.style.height = `${visualSize}px`;
}

// ============================================
// Zoom Functions
// ============================================

function calculateFitZoom() {
  const workspace = elements.eraserWorkspace;
  const padding = 32; // 16px padding on each side
  const availableWidth = workspace.clientWidth - padding;
  const availableHeight = workspace.clientHeight - padding;

  const scaleX = availableWidth / eraserState.baseCanvasWidth;
  const scaleY = availableHeight / eraserState.baseCanvasHeight;

  eraserState.fitZoom = Math.min(scaleX, scaleY, 1); // Don't upscale beyond 100%
}

function setZoom(zoom) {
  // Clamp zoom to valid range
  zoom = Math.max(eraserState.minZoom, Math.min(eraserState.maxZoom, zoom));
  eraserState.zoom = zoom;

  // Apply zoom via CSS width/height (not transform) so layout is affected
  const displayWidth = eraserState.baseCanvasWidth * zoom;
  const displayHeight = eraserState.baseCanvasHeight * zoom;
  elements.eraserCanvas.style.width = `${displayWidth}px`;
  elements.eraserCanvas.style.height = `${displayHeight}px`;

  // Update zoom level display
  elements.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;

  // Update cursor size for new zoom
  updateEraserCursor();
}

function zoomIn() {
  const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5];
  const currentIndex = steps.findIndex(s => s >= eraserState.zoom);
  const nextIndex = Math.min(currentIndex + 1, steps.length - 1);
  setZoom(steps[nextIndex]);
}

function zoomOut() {
  const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5];
  const currentIndex = steps.findIndex(s => s >= eraserState.zoom);
  const prevIndex = Math.max(currentIndex - 1, 0);
  setZoom(steps[prevIndex]);
}

function zoomToFit() {
  calculateFitZoom();
  setZoom(eraserState.fitZoom);

  // Center the scroll position
  requestAnimationFrame(() => {
    const workspace = elements.eraserWorkspace;
    workspace.scrollLeft = (workspace.scrollWidth - workspace.clientWidth) / 2;
    workspace.scrollTop = (workspace.scrollHeight - workspace.clientHeight) / 2;
  });
}

function handleZoomWheel(e) {
  if (!elements.eraserModal.classList.contains("active")) return;

  // Only zoom if Ctrl/Cmd is held
  if (!e.ctrlKey && !e.metaKey) return;

  e.preventDefault();

  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const newZoom = eraserState.zoom + delta;
  setZoom(newZoom);
}

function handleEraserMouseDown(e) {
  eraserState.isDrawing = true;
  const pos = getEraserPosition(e);
  eraserState.lastX = pos.x;
  eraserState.lastY = pos.y;

  // Draw single point
  eraseAt(pos.x, pos.y);
}

function handleEraserMouseMove(e) {
  // Cursor uses fixed positioning - use screen coordinates directly
  elements.eraserCursor.style.left = `${e.clientX}px`;
  elements.eraserCursor.style.top = `${e.clientY}px`;

  if (!eraserState.isDrawing) return;
  if (!isOverCanvas(e)) return;

  const pos = getEraserPosition(e);
  eraseLine(eraserState.lastX, eraserState.lastY, pos.x, pos.y);
  eraserState.lastX = pos.x;
  eraserState.lastY = pos.y;
}

function handleEraserMouseUp() {
  eraserState.isDrawing = false;
}

function handleEraserMouseLeave() {
  eraserState.isDrawing = false;
}

function getEraserPosition(e) {
  const rect = elements.eraserCanvas.getBoundingClientRect();
  const scaleX = eraserState.canvas.width / rect.width;
  const scaleY = eraserState.canvas.height / rect.height;

  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  return {
    x: Math.max(0, Math.min(eraserState.canvas.width, x)),
    y: Math.max(0, Math.min(eraserState.canvas.height, y)),
  };
}

function isOverCanvas(e) {
  const rect = elements.eraserCanvas.getBoundingClientRect();
  return e.clientX >= rect.left && e.clientX <= rect.right &&
         e.clientY >= rect.top && e.clientY <= rect.bottom;
}

function eraseAt(x, y) {
  const ctx = eraserState.ctx;
  const radius = eraserState.brushSize / 2;

  // Use destination-out to make pixels transparent
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function eraseLine(x1, y1, x2, y2) {
  const ctx = eraserState.ctx;
  const radius = eraserState.brushSize / 2;

  // Calculate distance and steps
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(Math.ceil(distance / (radius / 2)), 1);

  ctx.globalCompositeOperation = "destination-out";

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
}

function setupEraserEventListeners() {
  // Open eraser modal
  elements.eraserBtn.addEventListener("click", openEraserModal);

  // Eraser modal controls
  elements.eraserClose.addEventListener("click", closeEraserModal);
  elements.eraserReset.addEventListener("click", resetEraser);
  elements.eraserApply.addEventListener("click", applyEraser);

  // Brush size slider
  elements.eraserSize.addEventListener("input", updateEraserCursor);

  // Zoom controls
  elements.zoomIn.addEventListener("click", zoomIn);
  elements.zoomOut.addEventListener("click", zoomOut);
  elements.zoomFit.addEventListener("click", zoomToFit);
  elements.eraserWorkspace.addEventListener("wheel", handleZoomWheel, { passive: false });

  // Drawing events - mousedown on canvas, but track movement on workspace
  elements.eraserCanvas.addEventListener("mousedown", handleEraserMouseDown);
  elements.eraserWorkspace.addEventListener("mousemove", handleEraserMouseMove);
  elements.eraserWorkspace.addEventListener("mouseup", handleEraserMouseUp);
  elements.eraserWorkspace.addEventListener("mouseleave", handleEraserMouseLeave);

  // Close on escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.eraserModal.classList.contains("active")) {
      closeEraserModal();
    }
  });
}
