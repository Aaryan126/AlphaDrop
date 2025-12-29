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
};

// State
let state = {
  imageUrl: null,
  resultBase64: null,
  isProcessing: false,
};

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

  // Create download link
  const link = document.createElement("a");
  link.href = `data:image/png;base64,${state.resultBase64}`;

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
