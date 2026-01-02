/**
 * AlphaDrop - Popup UI Logic
 * Handles UI rendering and user interactions.
 */

// DOM elements
const elements = {
  noImage: document.getElementById("no-image"),
  mainContent: document.getElementById("main-content"),
  originalImage: document.getElementById("original-image"),
  resultImage: document.getElementById("result-image"),
  loadingOverlay: document.getElementById("loading-overlay"),
  methodSelect: document.getElementById("method"),
  processBtn: document.getElementById("process-btn"),
  downloadBtn: document.getElementById("download-btn"),
  statusIndicator: document.getElementById("status-indicator"),
  infoSection: document.getElementById("info-section"),
  methodInfo: document.getElementById("method-info"),
  confidenceInfo: document.getElementById("confidence-info"),
  analysisInfo: document.getElementById("analysis-info"),
  errorSection: document.getElementById("error-section"),
  errorMessage: document.getElementById("error-message"),
  // Edge refinement elements
  refinementSection: document.getElementById("refinement-section"),
  featherSlider: document.getElementById("feather-slider"),
  featherValue: document.getElementById("feather-value"),
  edgeAdjustSlider: document.getElementById("edge-adjust-slider"),
  edgeAdjustValue: document.getElementById("edge-adjust-value"),
  smoothSlider: document.getElementById("smooth-slider"),
  smoothValue: document.getElementById("smooth-value"),
  resetRefinement: document.getElementById("reset-refinement"),
};

// State
let state = {
  imageUrl: null,
  resultBase64: null,
  originalResultData: null, // Store original result for refinement
  isProcessing: false,
};

// Hidden canvas for image processing
const processingCanvas = document.createElement("canvas");
const processingCtx = processingCanvas.getContext("2d", { willReadFrequently: true });

// Initialize popup
document.addEventListener("DOMContentLoaded", async () => {
  console.log("AlphaDrop: Popup initialized");

  // Check API status
  await checkApiStatus();

  // Check for pending image from context menu
  const stored = await chrome.storage.local.get("pendingImage");
  if (stored.pendingImage) {
    const { url, timestamp } = stored.pendingImage;

    // Only use if recent (within 30 seconds)
    if (Date.now() - timestamp < 30000) {
      await loadImage(url);
    }

    // Clear the pending image
    await chrome.storage.local.remove("pendingImage");
  }

  // Set up event listeners
  elements.processBtn.addEventListener("click", handleProcess);
  elements.downloadBtn.addEventListener("click", handleDownload);

  // Edge refinement event listeners
  elements.featherSlider.addEventListener("input", handleRefinementChange);
  elements.edgeAdjustSlider.addEventListener("input", handleRefinementChange);
  elements.smoothSlider.addEventListener("input", handleRefinementChange);
  elements.resetRefinement.addEventListener("click", resetRefinementSliders);
});

/**
 * Check API health status.
 */
async function checkApiStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "CHECK_API" });
    if (response.success) {
      elements.statusIndicator.classList.add("connected");
      elements.statusIndicator.classList.remove("error");
      elements.statusIndicator.title = "API connected";
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error("AlphaDrop: API check failed:", error);
    elements.statusIndicator.classList.add("error");
    elements.statusIndicator.classList.remove("connected");
    elements.statusIndicator.title = "API not available";
  }
}

/**
 * Load image from URL.
 */
async function loadImage(url) {
  console.log("AlphaDrop: Loading image:", url);

  state.imageUrl = url;
  state.resultBase64 = null;

  // Show main content
  elements.noImage.classList.add("hidden");
  elements.mainContent.classList.remove("hidden");

  // Try to load the image directly first
  elements.originalImage.src = url;

  // Handle CORS issues by fetching through background script
  elements.originalImage.onerror = async () => {
    console.log("AlphaDrop: Direct load failed, fetching via background");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "FETCH_IMAGE",
        imageUrl: url,
      });
      if (response.success) {
        elements.originalImage.src = response.data;
      }
    } catch (error) {
      console.error("AlphaDrop: Failed to fetch image:", error);
      showError("Failed to load image. The image may be protected.");
    }
  };

  // Reset result
  elements.resultImage.src = "";
  elements.downloadBtn.disabled = true;
  hideInfo();
  hideError();

  // Hide refinement section
  elements.refinementSection.classList.add("hidden");
  state.originalResultData = null;
}

/**
 * Handle process button click.
 */
async function handleProcess() {
  if (state.isProcessing || !state.imageUrl) return;

  const method = elements.methodSelect.value;
  console.log("AlphaDrop: Processing with method:", method);

  state.isProcessing = true;
  elements.processBtn.disabled = true;
  elements.loadingOverlay.classList.remove("hidden");
  hideError();
  hideInfo();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "PROCESS_IMAGE",
      imageUrl: state.imageUrl,
      method: method,
    });

    if (!response.success) {
      throw new Error(response.error || "Processing failed");
    }

    const result = response.data;

    // Display result
    state.resultBase64 = result.image;
    elements.resultImage.src = `data:image/png;base64,${result.image}`;
    elements.downloadBtn.disabled = false;

    // Store original result for refinement
    await storeOriginalResult(result.image);

    // Show refinement controls and reset sliders
    resetRefinementSliders();
    elements.refinementSection.classList.remove("hidden");

    // Show info
    showInfo(result);
  } catch (error) {
    console.error("AlphaDrop: Processing error:", error);
    showError(error.message);
  } finally {
    state.isProcessing = false;
    elements.processBtn.disabled = false;
    elements.loadingOverlay.classList.add("hidden");
  }
}

/**
 * Handle download button click.
 */
function handleDownload() {
  if (!state.resultBase64) return;

  // Get current refined image from canvas or use stored base64
  let dataUrl;
  if (processingCanvas.width > 0 && processingCanvas.height > 0) {
    dataUrl = processingCanvas.toDataURL("image/png");
  } else {
    dataUrl = `data:image/png;base64,${state.resultBase64}`;
  }

  // Create download link
  const link = document.createElement("a");
  link.href = dataUrl;

  // Generate filename from original URL or use default
  let filename = "background-removed.png";
  try {
    const url = new URL(state.imageUrl);
    const pathParts = url.pathname.split("/");
    const originalName = pathParts[pathParts.length - 1];
    if (originalName) {
      const nameParts = originalName.split(".");
      nameParts.pop(); // Remove extension
      filename = `${nameParts.join(".")}-no-bg.png`;
    }
  } catch (e) {
    // Use default filename
  }

  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log("AlphaDrop: Downloaded:", filename);
}

/**
 * Show processing info.
 */
function showInfo(result) {
  elements.infoSection.classList.remove("hidden");

  const methodNames = {
    matting: "AI Matting",
    segmentation: "AI Segmentation",
    color: "Color-Based",
  };

  elements.methodInfo.textContent = `Method: ${methodNames[result.method_used] || result.method_used}`;
  elements.confidenceInfo.textContent = `Confidence: ${Math.round(result.confidence * 100)}%`;

  if (result.analysis) {
    const analysis = result.analysis;
    const details = [];
    if (analysis.has_face) details.push("Face detected");
    details.push(`Entropy: ${analysis.color_entropy}`);
    elements.analysisInfo.textContent = details.join(" | ");
  } else {
    elements.analysisInfo.textContent = "";
  }
}

/**
 * Hide info section.
 */
function hideInfo() {
  elements.infoSection.classList.add("hidden");
}

/**
 * Show error message.
 */
function showError(message) {
  elements.errorSection.classList.remove("hidden");
  elements.errorMessage.textContent = message;
}

/**
 * Hide error section.
 */
function hideError() {
  elements.errorSection.classList.add("hidden");
}

// ============================================
// Edge Refinement Functions
// ============================================

/**
 * Store original result image data for refinement.
 */
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

/**
 * Reset refinement sliders to default values.
 */
function resetRefinementSliders() {
  elements.featherSlider.value = 0;
  elements.featherValue.textContent = "0";
  elements.edgeAdjustSlider.value = 0;
  elements.edgeAdjustValue.textContent = "0";
  elements.smoothSlider.value = 0;
  elements.smoothValue.textContent = "0";

  // Reset to original image
  if (state.originalResultData) {
    processingCtx.putImageData(state.originalResultData, 0, 0);
    elements.resultImage.src = processingCanvas.toDataURL("image/png");
  }
}

/**
 * Handle refinement slider changes.
 */
function handleRefinementChange() {
  // Update value displays
  elements.featherValue.textContent = elements.featherSlider.value;
  elements.edgeAdjustValue.textContent = elements.edgeAdjustSlider.value;
  elements.smoothValue.textContent = elements.smoothSlider.value;

  // Apply refinements
  applyRefinements();
}

/**
 * Apply all refinement effects to the image.
 */
function applyRefinements() {
  if (!state.originalResultData) return;

  const feather = parseInt(elements.featherSlider.value);
  const edgeAdjust = parseInt(elements.edgeAdjustSlider.value);
  const smooth = parseInt(elements.smoothSlider.value);

  // Start with original image data
  const imageData = new ImageData(
    new Uint8ClampedArray(state.originalResultData.data),
    state.originalResultData.width,
    state.originalResultData.height
  );

  // Apply edge adjust first (erode/dilate)
  if (edgeAdjust !== 0) {
    applyEdgeAdjust(imageData, edgeAdjust);
  }

  // Apply feather (blur on alpha edges)
  if (feather > 0) {
    applyFeather(imageData, feather);
  }

  // Apply smooth (median-like filter on alpha)
  if (smooth > 0) {
    applySmooth(imageData, smooth);
  }

  // Update canvas and display
  processingCtx.putImageData(imageData, 0, 0);
  elements.resultImage.src = processingCanvas.toDataURL("image/png");
}

/**
 * Apply feather effect (Gaussian blur on alpha channel edges).
 */
function applyFeather(imageData, radius) {
  const { data, width, height } = imageData;

  // Create a copy of alpha channel
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  // Find edge pixels (where alpha transitions)
  const isEdge = new Uint8Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = alpha[idx];

      // Check if this pixel is near an edge
      if (a > 0 && a < 255) {
        isEdge[idx] = 1;
      } else {
        // Check neighbors
        const neighbors = [
          alpha[idx - 1], alpha[idx + 1],
          alpha[idx - width], alpha[idx + width]
        ];
        for (const n of neighbors) {
          if (Math.abs(a - n) > 10) {
            isEdge[idx] = 1;
            break;
          }
        }
      }
    }
  }

  // Apply box blur to alpha channel (only near edges)
  const blurred = new Float32Array(alpha);
  const kernelSize = radius * 2 + 1;

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = y * width + x;

      // Only blur near edges
      let nearEdge = false;
      for (let dy = -radius; dy <= radius && !nearEdge; dy++) {
        for (let dx = -radius; dx <= radius && !nearEdge; dx++) {
          if (isEdge[(y + dy) * width + (x + dx)]) {
            nearEdge = true;
          }
        }
      }

      if (nearEdge) {
        let sum = 0;
        let count = 0;
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

  // Write back to image data
  for (let i = 0; i < width * height; i++) {
    data[i * 4 + 3] = Math.round(blurred[i]);
  }
}

/**
 * Apply edge adjust (erode or dilate the alpha mask).
 */
function applyEdgeAdjust(imageData, amount) {
  const { data, width, height } = imageData;
  const iterations = Math.abs(amount);
  const erode = amount < 0;

  for (let iter = 0; iter < iterations; iter++) {
    // Create a copy of alpha channel
    const alpha = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      alpha[i] = data[i * 4 + 3];
    }

    // Apply morphological operation
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Get 3x3 neighborhood
        const neighbors = [
          alpha[idx - width - 1], alpha[idx - width], alpha[idx - width + 1],
          alpha[idx - 1], alpha[idx], alpha[idx + 1],
          alpha[idx + width - 1], alpha[idx + width], alpha[idx + width + 1]
        ];

        if (erode) {
          // Erode: use minimum of neighbors
          data[idx * 4 + 3] = Math.min(...neighbors);
        } else {
          // Dilate: use maximum of neighbors
          data[idx * 4 + 3] = Math.max(...neighbors);
        }
      }
    }
  }
}

/**
 * Apply smooth effect (removes jagged edges using median-like filter).
 */
function applySmooth(imageData, strength) {
  const { data, width, height } = imageData;

  // Create a copy of alpha channel
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  const radius = Math.ceil(strength / 2);

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = y * width + x;
      const centerAlpha = alpha[idx];

      // Only smooth pixels that are not fully transparent or opaque
      if (centerAlpha > 5 && centerAlpha < 250) {
        // Collect neighborhood values
        const neighbors = [];
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            neighbors.push(alpha[(y + dy) * width + (x + dx)]);
          }
        }

        // Sort and take median
        neighbors.sort((a, b) => a - b);
        const median = neighbors[Math.floor(neighbors.length / 2)];

        // Blend between original and median based on strength
        const blend = strength / 10;
        data[idx * 4 + 3] = Math.round(centerAlpha * (1 - blend) + median * blend);
      }
    }
  }
}
