/**
 * AlphaDrop - Background Service Worker
 * Handles context menu, API calls, and message passing.
 */

const API_BASE = "http://localhost:8000";

// Create context menu on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "alphadrop-remove-bg",
    title: "Remove Background",
    contexts: ["image"],
  });
  console.log("AlphaDrop: Context menu created");
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "alphadrop-remove-bg" && info.srcUrl) {
    console.log("AlphaDrop: Context menu clicked for image:", info.srcUrl);

    // Store the image URL for the popup
    chrome.storage.local.set(
      {
        pendingImage: {
          url: info.srcUrl,
          timestamp: Date.now(),
        },
      },
      () => {
        // Open the popup
        chrome.action.openPopup();
      }
    );
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("AlphaDrop: Received message:", message.type);

  if (message.type === "PROCESS_IMAGE") {
    processImage(message.imageUrl, message.method)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message })
      );
    return true; // Keep message channel open for async response
  }

  if (message.type === "FETCH_IMAGE") {
    fetchImageAsBlob(message.imageUrl)
      .then((blob) => blobToBase64(blob))
      .then((base64) => sendResponse({ success: true, data: base64 }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message })
      );
    return true;
  }

  if (message.type === "CHECK_API") {
    checkApiHealth()
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message })
      );
    return true;
  }
});

/**
 * Fetch image from URL and convert to Blob.
 */
async function fetchImageAsBlob(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  return await response.blob();
}

/**
 * Convert Blob to base64 data URL.
 */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Process image through the API with progress tracking.
 */
async function processImage(imageUrl, method = "auto") {
  console.log("AlphaDrop: Processing image with method:", method);

  // Fetch the image
  const imageBlob = await fetchImageAsBlob(imageUrl);

  // Determine content type
  const contentType = imageBlob.type || "image/png";
  const extension = contentType.split("/")[1] || "png";

  // Create form data
  const formData = new FormData();
  formData.append("image", imageBlob, `image.${extension}`);
  formData.append("method", method);

  // Start the task
  const startResponse = await fetch(`${API_BASE}/v1/start-task`, {
    method: "POST",
    body: formData,
  });

  if (!startResponse.ok) {
    const error = await startResponse.json().catch(() => ({}));
    throw new Error(error.detail || `API error: ${startResponse.status}`);
  }

  const { task_id } = await startResponse.json();
  console.log("AlphaDrop: Task started:", task_id);

  // Poll for progress
  const result = await pollTaskProgress(task_id);

  console.log("AlphaDrop: API response:", {
    method: result.method_used,
    confidence: result.confidence,
  });

  return result;
}

/**
 * Poll task progress until completion.
 */
async function pollTaskProgress(taskId) {
  const POLL_INTERVAL = 200; // 200ms between polls
  const MAX_POLLS = 300; // Max 60 seconds (300 * 200ms)

  for (let i = 0; i < MAX_POLLS; i++) {
    const response = await fetch(`${API_BASE}/v1/task/${taskId}`);

    if (!response.ok) {
      throw new Error(`Failed to get task status: ${response.status}`);
    }

    const progress = await response.json();

    // Send progress update to popup
    chrome.runtime.sendMessage({
      type: "PROGRESS_UPDATE",
      taskId: taskId,
      progress: progress.progress,
      message: progress.message,
      status: progress.status,
    }).catch(() => {
      // Popup might be closed, ignore
    });

    if (progress.status === "completed") {
      if (progress.result) {
        return progress.result;
      }
      throw new Error("Task completed but no result");
    }

    if (progress.status === "failed") {
      throw new Error(progress.error || "Processing failed");
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
  }

  throw new Error("Processing timeout - task took too long");
}

/**
 * Check API health.
 */
async function checkApiHealth() {
  const response = await fetch(`${API_BASE}/health`);
  if (!response.ok) {
    throw new Error("API is not available");
  }
  return await response.json();
}
