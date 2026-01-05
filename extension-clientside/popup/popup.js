/**
 * AlphaDrop - Client-Side Popup UI (Full Featured)
 */

// DOM Elements
const elements = {
  app: document.querySelector(".app"),
  emptyState: document.getElementById("empty-state"),
  uploadBtn: document.getElementById("upload-btn"),
  fileInput: document.getElementById("file-input"),
  mainContent: document.getElementById("main-content"),
  uploadNewBtn: document.getElementById("upload-new-btn"),
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
  // Size warning modal
  sizeWarningModal: document.getElementById("size-warning-modal"),
  sizeWarningInfo: document.getElementById("size-warning-info"),
  sizeWarningDetails: document.getElementById("size-warning-details"),
  sizeWarningResize: document.getElementById("size-warning-resize"),
  sizeWarningProceed: document.getElementById("size-warning-proceed"),
  sizeWarningHardLimit: document.getElementById("size-warning-hard-limit"),
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

// Request tracking for race condition handling
let currentRequestId = 0;
const REQUEST_TIMEOUT_MS = 120000; // 2 minute timeout

// Processing state recovery
const PROCESSING_STATE_KEY = "processingState";
const PROCESSING_STATE_TTL_MS = 120000; // 2 minute TTL for recovery for processing

// Progress animation state
const progressState = {
  target: 0,
  display: 0,
  animationId: null,
  lastUpdate: 0,
  isAnimating: false,
};

// Canvas for image processing
const processingCanvas = document.createElement("canvas");
const processingCtx = processingCanvas.getContext("2d", { willReadFrequently: true });

// Persistence constants
const STORAGE_KEY = "persistedSessionLocal";
const MAX_STORAGE_MB = 4;

// Image size limits (in megapixels)
const IMAGE_SIZE_WARNING_MP = 4;      // Show warning above 4MP (2000×2000)
const IMAGE_SIZE_RECOMMEND_RESIZE_MP = 16; // Strongly recommend resize above 16MP (4K)
const IMAGE_SIZE_HARD_LIMIT_MP = 25;  // Hard limit at 25MP (~5000×5000)
const RESIZE_TARGET_MP = 4;           // Resize to 4MP when user chooses resize

// Size warning state
let pendingSizeWarningImage = null;

/**
 * Check image size and return warning level.
 * @returns {null | 'warning' | 'recommend' | 'hardlimit'}
 */
function checkImageSize(width, height) {
  const megapixels = (width * height) / 1_000_000;

  if (megapixels > IMAGE_SIZE_HARD_LIMIT_MP) {
    return 'hardlimit';
  } else if (megapixels > IMAGE_SIZE_RECOMMEND_RESIZE_MP) {
    return 'recommend';
  } else if (megapixels > IMAGE_SIZE_WARNING_MP) {
    return 'warning';
  }
  return null;
}

/**
 * Show the size warning modal with appropriate messaging.
 */
function showSizeWarning(width, height, imageDataUrl) {
  const megapixels = (width * height) / 1_000_000;
  const level = checkImageSize(width, height);

  pendingSizeWarningImage = imageDataUrl;

  // Set info text
  elements.sizeWarningInfo.textContent =
    `Image size: ${width.toLocaleString()} × ${height.toLocaleString()} (${megapixels.toFixed(1)} MP)`;

  // Set details and button states based on level
  if (level === 'hardlimit') {
    elements.sizeWarningDetails.textContent =
      `Maximum supported size is ${IMAGE_SIZE_HARD_LIMIT_MP} MP. Please resize to continue.`;
    elements.sizeWarningProceed.classList.add('hidden');
    elements.sizeWarningHardLimit.classList.remove('hidden');
  } else if (level === 'recommend') {
    elements.sizeWarningDetails.textContent =
      `Images above ${IMAGE_SIZE_RECOMMEND_RESIZE_MP} MP may process slowly or fail. Resizing is strongly recommended.`;
    elements.sizeWarningProceed.classList.remove('hidden');
    elements.sizeWarningHardLimit.classList.add('hidden');
  } else {
    elements.sizeWarningDetails.textContent =
      `Large images may take longer to process. Resizing can improve performance.`;
    elements.sizeWarningProceed.classList.remove('hidden');
    elements.sizeWarningHardLimit.classList.add('hidden');
  }

  elements.sizeWarningModal.classList.add('active');
}

/**
 * Hide the size warning modal.
 */
function hideSizeWarning() {
  elements.sizeWarningModal.classList.remove('active');
  pendingSizeWarningImage = null;
}

/**
 * Resize an image to target megapixels while maintaining aspect ratio.
 * @returns {Promise<string>} Resized image as data URL
 */
function resizeImage(imageDataUrl, targetMP = RESIZE_TARGET_MP) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const currentMP = (width * height) / 1_000_000;

      // Calculate scale factor to reach target MP
      const scale = Math.sqrt(targetMP / currentMP);
      const newWidth = Math.round(width * scale);
      const newHeight = Math.round(height * scale);

      // Create canvas and resize
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');

      // Use high-quality image smoothing
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.drawImage(img, 0, 0, newWidth, newHeight);

      // Return as PNG to preserve quality
      const resizedDataUrl = canvas.toDataURL('image/png');

      console.log(`AlphaDrop: Resized image from ${width}×${height} to ${newWidth}×${newHeight}`);
      resolve(resizedDataUrl);
    };
    img.onerror = () => reject(new Error('Failed to load image for resizing'));
    img.src = imageDataUrl;
  });
}

/**
 * Handle resize button click in warning modal.
 */
async function handleSizeWarningResize() {
  if (!pendingSizeWarningImage) return;

  try {
    const resizedDataUrl = await resizeImage(pendingSizeWarningImage);
    hideSizeWarning();

    // Continue loading with resized image
    await continueLoadImage(resizedDataUrl);
  } catch (error) {
    console.error('AlphaDrop: Failed to resize image:', error);
    showError('Failed to resize image');
    hideSizeWarning();
  }
}

/**
 * Handle proceed button click in warning modal.
 */
async function handleSizeWarningProceed() {
  if (!pendingSizeWarningImage) return;

  const imageDataUrl = pendingSizeWarningImage;
  hideSizeWarning();

  // Continue loading with original image
  await continueLoadImage(imageDataUrl);
}

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
  initLocalStatus();

  // Check if there's a fresh pending image first (user just right-clicked)
  // This takes priority over recovery - user wants to process a new image
  const pendingCheck = await chrome.storage.local.get("pendingImage");
  const hasFreshPendingImage = pendingCheck.pendingImage &&
    (Date.now() - pendingCheck.pendingImage.timestamp < 5000); // Within last 5 seconds

  if (hasFreshPendingImage) {
    // User just right-clicked a new image - clear any old processing state
    await clearProcessingState();
    await loadPendingImage();
  } else {
    // Check for processing state recovery (popup closed during processing)
    const recovered = await checkProcessingStateRecovery();

    if (!recovered) {
      // Normal startup - check for persisted session or pending image
      await loadPersistedState();
      await loadPendingImage();
    }
  }

  setupEventListeners();
  setupProgressListener();
  setupPendingImageListener(); // Listen for new images while popup is open
  setupCropEventListeners();
  setupEraserEventListeners();
});

// ============================================
// Persistence Functions
// ============================================

async function savePersistedState() {
  if (!state.imageUrl || !state.resultBase64) return;

  let originalBase64 = elements.originalImage.src;
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

async function loadPersistedState() {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const session = stored[STORAGE_KEY];

    if (!session) return;

    const MAX_AGE = 24 * 60 * 60 * 1000;
    if (Date.now() - session.timestamp > MAX_AGE) {
      await clearPersistedState();
      return;
    }

    state.imageUrl = session.originalImage;
    state.resultBase64 = session.resultBase64;

    elements.emptyState.classList.add("hidden");
    elements.mainContent.classList.remove("hidden");
    elements.originalImage.src = session.originalImage;
    elements.resultImage.src = `data:image/png;base64,${session.resultBase64}`;
    elements.resultCard.classList.remove("hidden");
    elements.resultFrame.classList.add("checkerboard");
    elements.downloadBtn.classList.remove("hidden");
    elements.refineBtn.classList.remove("hidden");
    elements.eraserBtn.classList.remove("hidden");

    await storeOriginalResult(session.resultBase64);

    console.log("AlphaDrop: Session restored");
  } catch (error) {
    console.error("AlphaDrop: Failed to load persisted session:", error);
  }
}

async function clearPersistedState() {
  try {
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (error) {
    console.error("AlphaDrop: Failed to clear persisted session:", error);
  }
}

// ============================================
// Processing State Recovery
// ============================================

/**
 * Save processing state so it can be recovered if popup closes.
 * Only saves if image is under size limit to avoid quota issues.
 */
async function saveProcessingState(originalImageData, requestId) {
  const sizeInMB = originalImageData.length / 1024 / 1024;

  // Skip if image is too large (keep under 3MB to leave room for result)
  if (sizeInMB > 3) {
    console.log(`AlphaDrop: Image too large for recovery (${sizeInMB.toFixed(1)}MB)`);
    return false;
  }

  try {
    await chrome.storage.local.set({
      [PROCESSING_STATE_KEY]: {
        originalImage: originalImageData,
        requestId: requestId,
        timestamp: Date.now(),
        status: "processing"
      }
    });
    console.log("AlphaDrop: Processing state saved for recovery");
    return true;
  } catch (error) {
    console.error("AlphaDrop: Failed to save processing state:", error);
    return false;
  }
}

/**
 * Update processing state with the result.
 * Called when processing completes successfully.
 */
async function updateProcessingStateWithResult(resultBase64, requestId) {
  try {
    const stored = await chrome.storage.local.get(PROCESSING_STATE_KEY);
    const processingState = stored[PROCESSING_STATE_KEY];

    // Only update if this is the same request
    if (!processingState || processingState.requestId !== requestId) {
      return;
    }

    await chrome.storage.local.set({
      [PROCESSING_STATE_KEY]: {
        ...processingState,
        resultBase64: resultBase64,
        status: "completed",
        completedAt: Date.now()
      }
    });
    console.log("AlphaDrop: Processing result saved for recovery");
  } catch (error) {
    console.error("AlphaDrop: Failed to save processing result:", error);
  }
}

/**
 * Clear processing state after it's been used or expired.
 */
async function clearProcessingState() {
  try {
    await chrome.storage.local.remove(PROCESSING_STATE_KEY);
  } catch (error) {
    console.error("AlphaDrop: Failed to clear processing state:", error);
  }
}

/**
 * Check for and recover from a previous processing session.
 * Returns true if state was recovered.
 */
async function checkProcessingStateRecovery() {
  try {
    const stored = await chrome.storage.local.get(PROCESSING_STATE_KEY);
    const processingState = stored[PROCESSING_STATE_KEY];

    if (!processingState) return false;

    const age = Date.now() - processingState.timestamp;

    // Expired - clean up
    if (age > PROCESSING_STATE_TTL_MS) {
      console.log("AlphaDrop: Processing state expired, clearing");
      await clearProcessingState();
      return false;
    }

    // Has completed result - recover it
    if (processingState.status === "completed" && processingState.resultBase64) {
      console.log("AlphaDrop: Recovering completed processing result");

      try {
        state.imageUrl = processingState.originalImage;
        state.resultBase64 = processingState.resultBase64;

        elements.emptyState.classList.add("hidden");
        elements.mainContent.classList.remove("hidden");
        elements.originalImage.src = processingState.originalImage;
        elements.resultImage.src = `data:image/png;base64,${processingState.resultBase64}`;
        elements.resultCard.classList.remove("hidden");
        elements.resultFrame.classList.add("checkerboard");
        elements.downloadBtn.classList.remove("hidden");
        elements.refineBtn.classList.remove("hidden");
        elements.eraserBtn.classList.remove("hidden");

        await storeOriginalResult(processingState.resultBase64);
        await clearProcessingState();
        await savePersistedState();

        return true;
      } catch (err) {
        console.error("AlphaDrop: Error during recovery:", err);
        await clearProcessingState();
        return false;
      }
    }

    // Still processing - show the original image
    // DON'T clear processing state yet - offscreen might still complete and save result
    if (processingState.status === "processing") {
      console.log("AlphaDrop: Previous processing may still be running, waiting briefly...");

      state.imageUrl = processingState.originalImage;
      elements.emptyState.classList.add("hidden");
      elements.mainContent.classList.remove("hidden");
      elements.originalImage.src = processingState.originalImage;

      // Wait a short time to see if processing completes
      // This handles the race condition where offscreen finishes right as popup opens
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Re-check if processing completed during our wait
      const recheckStored = await chrome.storage.local.get(PROCESSING_STATE_KEY);
      const recheckState = recheckStored[PROCESSING_STATE_KEY];

      if (recheckState?.status === "completed" && recheckState.resultBase64) {
        console.log("AlphaDrop: Processing completed during wait, recovering result");
        try {
          state.resultBase64 = recheckState.resultBase64;
          elements.resultImage.src = `data:image/png;base64,${recheckState.resultBase64}`;
          elements.resultCard.classList.remove("hidden");
          elements.resultFrame.classList.add("checkerboard");
          elements.downloadBtn.classList.remove("hidden");
          elements.refineBtn.classList.remove("hidden");
          elements.eraserBtn.classList.remove("hidden");

          await storeOriginalResult(recheckState.resultBase64);
          await clearProcessingState();
          await savePersistedState();
        } catch (err) {
          console.error("AlphaDrop: Error during recovery:", err);
          await clearProcessingState();
        }
      } else {
        // Processing didn't complete - clear stale state, user can re-process
        console.log("AlphaDrop: Processing did not complete, clearing stale state");
        await clearProcessingState();
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error("AlphaDrop: Failed to check processing state:", error);
    return false;
  }
}

// Listen for progress updates from offscreen document
function setupProgressListener() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "PROGRESS") {
      // Only update progress if we're actively processing
      if (state.isProcessing) {
        setTargetProgress(message.pct);
      }
    }
  });
}

function setTargetProgress(percent) {
  if (percent > progressState.target) {
    progressState.target = percent;
    progressState.lastUpdate = performance.now();
  }

  if (!progressState.isAnimating) {
    progressState.isAnimating = true;
    animateProgress();
  }
}

function animateProgress() {
  const now = performance.now();
  const timeSinceUpdate = now - progressState.lastUpdate;
  const diff = progressState.target - progressState.display;

  if (diff > 0.1) {
    const speed = 0.12;
    const step = Math.max(0.5, diff * speed);
    progressState.display = Math.min(progressState.display + step, progressState.target);
  } else if (progressState.target < 95 && timeSinceUpdate > 500) {
    const maxDrift = Math.max(progressState.display, progressState.target - 2);
    if (progressState.display < maxDrift) {
      progressState.display += 0.03;
    }
  }

  renderProgress(progressState.display);

  if (state.isProcessing && progressState.display < 100) {
    progressState.animationId = requestAnimationFrame(animateProgress);
  } else {
    progressState.isAnimating = false;
  }
}

function renderProgress(percent) {
  const circumference = 97.4;
  const offset = circumference - (percent / 100) * circumference;

  if (elements.progressCircle) {
    elements.progressCircle.style.strokeDashoffset = offset;
  }
}

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

function stopProgressAnimation() {
  progressState.isAnimating = false;
  if (progressState.animationId) {
    cancelAnimationFrame(progressState.animationId);
    progressState.animationId = null;
  }
}

function setupEventListeners() {
  // Method pill selection (visual only - all use same model)
  elements.methodPills.forEach((pill) => {
    pill.addEventListener("click", () => selectMethod(pill.dataset.method));
  });

  elements.processBtn.addEventListener("click", handleProcess);
  elements.downloadBtn.addEventListener("click", handleDownload);
  elements.downloadBtnRefine.addEventListener("click", handleDownload);

  elements.refineBtn.addEventListener("click", toggleRefinementView);
  elements.resetRefinement.addEventListener("click", resetRefinement);

  const sliders = [elements.featherSlider, elements.edgeAdjustSlider, elements.smoothSlider];
  sliders.forEach(slider => {
    slider.addEventListener("input", handleSliderChange);
    updateSliderProgress(slider);
  });

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

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (elements.lightbox.classList.contains("active")) {
        closeLightbox();
      }
      if (elements.sizeWarningModal.classList.contains("active")) {
        hideSizeWarning();
      }
    }
  });

  // Size warning modal buttons
  elements.sizeWarningResize.addEventListener("click", handleSizeWarningResize);
  elements.sizeWarningProceed.addEventListener("click", handleSizeWarningProceed);

  // File upload
  elements.uploadBtn.addEventListener("click", () => elements.fileInput.click());
  elements.uploadNewBtn.addEventListener("click", () => elements.fileInput.click());
  elements.fileInput.addEventListener("change", handleFileUpload);
}

// Local status - always connected since it runs locally
function initLocalStatus() {
  elements.statusDot.classList.add("connected");
  elements.statusDot.title = "Running Locally";
}

async function loadPendingImage() {
  const stored = await chrome.storage.local.get("pendingImage");
  if (stored.pendingImage) {
    const { url, timestamp } = stored.pendingImage;
    // Check if pending image is recent (within 60 seconds)
    if (Date.now() - timestamp < 60000) {
      // This will cancel any ongoing processing via loadImage()
      await loadImage(url);
    }
    await chrome.storage.local.remove("pendingImage");
  }
}

/**
 * Handle file upload from the file input.
 */
function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.type.startsWith('image/')) {
    showError('Please select an image file');
    return;
  }

  // Read file as data URL
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    loadImage(dataUrl);
  };
  reader.onerror = () => {
    showError('Failed to read file');
  };
  reader.readAsDataURL(file);

  // Reset input so same file can be selected again
  event.target.value = '';
}

// Handle new pending images even while popup is open
// This catches right-clicks that happen while the popup is already open
function setupPendingImageListener() {
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local" && changes.pendingImage?.newValue) {
      const { url, timestamp } = changes.pendingImage.newValue;
      if (Date.now() - timestamp < 60000) {
        // Load new image (will cancel any ongoing processing)
        loadImage(url);
        // Clear the pending image
        chrome.storage.local.remove("pendingImage");
      }
    }
  });
}

async function loadImage(url) {
  // Cancel any ongoing processing by incrementing request ID
  if (state.isProcessing) {
    console.log("AlphaDrop: Cancelling previous processing request");
    currentRequestId++;
    state.isProcessing = false;
    elements.processBtn.disabled = false;
    elements.loadingCard.classList.add("hidden");
    stopProgressAnimation();
  }

  // Close any open size warning modal
  hideSizeWarning();

  // First, fetch the image to check its dimensions
  let imageDataUrl = url;

  // If it's not already a data URL, fetch it
  if (!url.startsWith('data:')) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "FETCH_IMAGE",
        imageUrl: url,
      });
      if (response.success) {
        imageDataUrl = response.data;
      } else {
        showError("Failed to load image");
        return;
      }
    } catch {
      showError("Failed to load image");
      return;
    }
  }

  // Load image to check dimensions
  const img = new Image();
  img.onload = () => {
    const width = img.width;
    const height = img.height;
    const sizeLevel = checkImageSize(width, height);

    if (sizeLevel) {
      // Show size warning modal
      showSizeWarning(width, height, imageDataUrl);
    } else {
      // No warning needed, continue loading
      continueLoadImage(imageDataUrl);
    }
  };
  img.onerror = () => {
    showError("Failed to load image");
  };
  img.src = imageDataUrl;
}

/**
 * Continue loading the image after size check has passed.
 * Called directly or after user approves size warning.
 */
async function continueLoadImage(imageDataUrl) {
  state.imageUrl = imageDataUrl;
  state.resultBase64 = null;
  state.originalResultData = null;

  await clearPersistedState();

  elements.emptyState.classList.add("hidden");
  elements.mainContent.classList.remove("hidden");

  elements.originalImage.src = imageDataUrl;

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

function selectMethod(method) {
  state.selectedMethod = method;
  elements.methodPills.forEach((pill) => {
    pill.classList.toggle("active", pill.dataset.method === method);
  });
}

// Process image - client-side version
async function handleProcess() {
  if (state.isProcessing || !state.imageUrl) return;

  // Increment request ID and capture it for this request
  currentRequestId++;
  const thisRequestId = currentRequestId;

  state.isProcessing = true;
  elements.processBtn.disabled = true;
  elements.resultCard.classList.add("hidden");
  elements.loadingCard.classList.remove("hidden");
  resetProgress();
  hideError();

  // Setup timeout
  const timeoutId = setTimeout(() => {
    if (state.isProcessing && currentRequestId === thisRequestId) {
      console.log("AlphaDrop: Request timed out");
      currentRequestId++; // Cancel this request
      state.isProcessing = false;
      elements.processBtn.disabled = false;
      elements.loadingCard.classList.add("hidden");
      stopProgressAnimation();
      showError("Processing timed out. Please try again.");
    }
  }, REQUEST_TIMEOUT_MS);

  try {
    // Check if request was cancelled
    if (currentRequestId !== thisRequestId) {
      console.log("AlphaDrop: Request cancelled before fetch");
      return;
    }

    // First fetch the image as data URL
    const fetchRes = await chrome.runtime.sendMessage({
      type: "FETCH_IMAGE",
      imageUrl: state.imageUrl,
    });

    // Check again after async operation
    if (currentRequestId !== thisRequestId) {
      console.log("AlphaDrop: Request cancelled after fetch");
      return;
    }

    if (!fetchRes.success) {
      throw new Error(fetchRes.error || "Failed to fetch image");
    }

    // Save processing state for recovery (if popup closes)
    await saveProcessingState(fetchRes.data, thisRequestId);

    setTargetProgress(10);

    // AI methods (matting/segmentation) - use offscreen document
    const result = await chrome.runtime.sendMessage({
      type: "PROCESS_IMAGE",
      imageData: fetchRes.data,
      method: state.selectedMethod, // 'matting' or 'segmentation'
    });

    // Check if cancelled after AI processing
    if (currentRequestId !== thisRequestId) {
      console.log("AlphaDrop: Request cancelled after AI processing");
      return;
    }

    if (!result.success) {
      throw new Error(result.error || "Processing failed");
    }

    const resultDataUrl = result.data;

    // Final check before updating UI
    if (currentRequestId !== thisRequestId) {
      console.log("AlphaDrop: Request cancelled before UI update");
      return;
    }

    // Extract base64 from data URL
    state.resultBase64 = resultDataUrl.replace(/^data:image\/png;base64,/, "");
    elements.resultImage.src = resultDataUrl;

    await storeOriginalResult(state.resultBase64);

    elements.resultCard.classList.remove("hidden");
    elements.resultFrame.classList.add("checkerboard");
    elements.downloadBtn.classList.remove("hidden");
    elements.refineBtn.classList.remove("hidden");
    elements.eraserBtn.classList.remove("hidden");

    // Clear processing state (no longer needed for recovery)
    await clearProcessingState();

    await savePersistedState();
  } catch (error) {
    // Only show error if this request is still current
    if (currentRequestId === thisRequestId) {
      showError(error.message || "An error occurred");
      // Clear processing state on error
      await clearProcessingState().catch(() => {});
    }
  } finally {
    clearTimeout(timeoutId);
    // Only reset state if this request is still current
    if (currentRequestId === thisRequestId) {
      state.isProcessing = false;
      elements.processBtn.disabled = false;
      elements.loadingCard.classList.add("hidden");
      stopProgressAnimation();
    }
  }
}

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

  updateSliderProgress(elements.featherSlider);
  updateSliderProgress(elements.edgeAdjustSlider);
  updateSliderProgress(elements.smoothSlider);

  if (state.originalResultData) {
    processingCtx.putImageData(state.originalResultData, 0, 0);
    elements.resultImage.src = processingCanvas.toDataURL("image/png");
  }
}

let refinementTimeout = null;

function handleSliderChange(e) {
  updateSliderValues();
  updateSliderProgress(e.target);

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

const cropState = {
  target: null,
  imageWidth: 0,
  imageHeight: 0,
  displayWidth: 0,
  displayHeight: 0,
  selection: { x: 0, y: 0, width: 0, height: 0 },
  isDragging: false,
  dragType: null,
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
    cropState.imageWidth = elements.cropImage.naturalWidth;
    cropState.imageHeight = elements.cropImage.naturalHeight;
    cropState.displayWidth = elements.cropImage.offsetWidth;
    cropState.displayHeight = elements.cropImage.offsetHeight;

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

    if (handle.includes("w")) {
      const maxDx = start.width - minSize;
      const clampedDx = Math.max(-start.x, Math.min(maxDx, dx));
      newX = start.x + clampedDx;
      newWidth = start.width - clampedDx;
    }
    if (handle.includes("e")) {
      newWidth = Math.max(minSize, Math.min(cropState.displayWidth - start.x, start.width + dx));
    }

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

  const scaleX = cropState.imageWidth / cropState.displayWidth;
  const scaleY = cropState.imageHeight / cropState.displayHeight;

  const cropX = Math.round(sel.x * scaleX);
  const cropY = Math.round(sel.y * scaleY);
  const cropWidth = Math.round(sel.width * scaleX);
  const cropHeight = Math.round(sel.height * scaleY);

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropWidth;
  cropCanvas.height = cropHeight;
  const ctx = cropCanvas.getContext("2d");

  ctx.drawImage(
    elements.cropImage,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );

  const croppedDataUrl = cropCanvas.toDataURL("image/png");

  if (cropState.target === "original") {
    elements.originalImage.src = croppedDataUrl;
    state.imageUrl = croppedDataUrl;
  } else if (cropState.target === "result") {
    const base64 = croppedDataUrl.replace(/^data:image\/png;base64,/, "");
    state.resultBase64 = base64;
    elements.resultImage.src = croppedDataUrl;

    const img = new Image();
    img.onload = () => {
      processingCanvas.width = img.width;
      processingCanvas.height = img.height;
      processingCtx.drawImage(img, 0, 0);
      state.originalResultData = processingCtx.getImageData(0, 0, img.width, img.height);

      savePersistedState();
    };
    img.src = croppedDataUrl;
  }

  closeCropModal();
}

function setupCropEventListeners() {
  elements.cropBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openCropModal(btn.dataset.target);
    });
  });

  elements.cropCancel.addEventListener("click", closeCropModal);
  elements.cropReset.addEventListener("click", resetCropSelection);
  elements.cropApply.addEventListener("click", applyCrop);

  elements.cropImageContainer.addEventListener("mousedown", handleCropMouseDown);
  document.addEventListener("mousemove", handleCropMouseMove);
  document.addEventListener("mouseup", handleCropMouseUp);

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

  const canvas = elements.eraserCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  canvas.width = processingCanvas.width;
  canvas.height = processingCanvas.height;

  eraserState.baseCanvasWidth = canvas.width;
  eraserState.baseCanvasHeight = canvas.height;

  ctx.drawImage(processingCanvas, 0, 0);

  eraserState.originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  eraserState.canvas = canvas;
  eraserState.ctx = ctx;

  elements.eraserModal.classList.add("active");

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

  processingCanvas.width = eraserState.canvas.width;
  processingCanvas.height = eraserState.canvas.height;
  processingCtx.drawImage(eraserState.canvas, 0, 0);

  elements.resultImage.src = processingCanvas.toDataURL("image/png");

  state.resultBase64 = processingCanvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  state.originalResultData = processingCtx.getImageData(0, 0, processingCanvas.width, processingCanvas.height);

  savePersistedState();

  closeEraserModal();
}

function updateEraserCursor() {
  const size = parseInt(elements.eraserSize.value);
  eraserState.brushSize = size;
  elements.eraserSizeValue.textContent = `${size}px`;

  const visualSize = size * eraserState.zoom;
  elements.eraserCursor.style.width = `${visualSize}px`;
  elements.eraserCursor.style.height = `${visualSize}px`;
}

// ============================================
// Zoom Functions
// ============================================

function calculateFitZoom() {
  const workspace = elements.eraserWorkspace;
  const padding = 32;
  const availableWidth = workspace.clientWidth - padding;
  const availableHeight = workspace.clientHeight - padding;

  const scaleX = availableWidth / eraserState.baseCanvasWidth;
  const scaleY = availableHeight / eraserState.baseCanvasHeight;

  eraserState.fitZoom = Math.min(scaleX, scaleY, 1);
}

function setZoom(zoom) {
  zoom = Math.max(eraserState.minZoom, Math.min(eraserState.maxZoom, zoom));
  eraserState.zoom = zoom;

  const displayWidth = eraserState.baseCanvasWidth * zoom;
  const displayHeight = eraserState.baseCanvasHeight * zoom;
  elements.eraserCanvas.style.width = `${displayWidth}px`;
  elements.eraserCanvas.style.height = `${displayHeight}px`;

  elements.zoomLevel.textContent = `${Math.round(zoom * 100)}%`;

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

  requestAnimationFrame(() => {
    const workspace = elements.eraserWorkspace;
    workspace.scrollLeft = (workspace.scrollWidth - workspace.clientWidth) / 2;
    workspace.scrollTop = (workspace.scrollHeight - workspace.clientHeight) / 2;
  });
}

function handleZoomWheel(e) {
  if (!elements.eraserModal.classList.contains("active")) return;

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

  eraseAt(pos.x, pos.y);
}

function handleEraserMouseMove(e) {
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

  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function eraseLine(x1, y1, x2, y2) {
  const ctx = eraserState.ctx;
  const radius = eraserState.brushSize / 2;

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
  elements.eraserBtn.addEventListener("click", openEraserModal);

  elements.eraserClose.addEventListener("click", closeEraserModal);
  elements.eraserReset.addEventListener("click", resetEraser);
  elements.eraserApply.addEventListener("click", applyEraser);

  elements.eraserSize.addEventListener("input", updateEraserCursor);

  elements.zoomIn.addEventListener("click", zoomIn);
  elements.zoomOut.addEventListener("click", zoomOut);
  elements.zoomFit.addEventListener("click", zoomToFit);
  elements.eraserWorkspace.addEventListener("wheel", handleZoomWheel, { passive: false });

  elements.eraserCanvas.addEventListener("mousedown", handleEraserMouseDown);
  elements.eraserWorkspace.addEventListener("mousemove", handleEraserMouseMove);
  elements.eraserWorkspace.addEventListener("mouseup", handleEraserMouseUp);
  elements.eraserWorkspace.addEventListener("mouseleave", handleEraserMouseLeave);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && elements.eraserModal.classList.contains("active")) {
      closeEraserModal();
    }
  });
}
