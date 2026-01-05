import { AutoModel, AutoProcessor, env, RawImage } from "@huggingface/transformers";

// Configure Transformers.js for Chrome extension compatibility
env.allowLocalModels = false;
env.useBrowserCache = true;

// Disable Web Worker proxy to avoid blob URL CSP issues
env.backends.onnx.wasm.proxy = false;

// Use local WASM files instead of CDN
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("/");

let model = null;
let processor = null;

async function loadModel(sendProgress) {
  if (model && processor) return;

  sendProgress("Loading model...", 0);

  model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
    device: "webgpu",
    dtype: "fp32",
    progress_callback: (progress) => {
      if (progress.status === "progress") {
        sendProgress("Downloading model", Math.round(progress.progress));
      }
    }
  }).catch(async () => {
    // Fallback to WASM if WebGPU not available
    sendProgress("WebGPU unavailable, using WASM...", 0);
    return AutoModel.from_pretrained("briaai/RMBG-1.4", {
      device: "wasm",
      dtype: "fp32",
      progress_callback: (progress) => {
        if (progress.status === "progress") {
          sendProgress("Downloading model", Math.round(progress.progress));
        }
      }
    });
  });

  processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4");
  sendProgress("Model loaded", 100);
}

async function removeBackground(imageDataUrl, sendProgress) {
  await loadModel(sendProgress);

  sendProgress("Processing image", 0);

  // Load image from data URL
  const image = await RawImage.fromURL(imageDataUrl);

  sendProgress("Processing image", 30);

  // Prepare inputs
  const { pixel_values } = await processor(image);

  sendProgress("Processing image", 50);

  // Run model
  const { output } = await model({ input: pixel_values });

  sendProgress("Processing image", 70);

  // Post-process mask
  const mask = await RawImage.fromTensor(output[0].mul(255).to("uint8")).resize(image.width, image.height);

  sendProgress("Processing image", 90);

  // Create canvas and apply mask
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");

  // Draw original image
  const imgBitmap = await createImageBitmap(await (await fetch(imageDataUrl)).blob());
  ctx.drawImage(imgBitmap, 0, 0);

  // Get image data and apply alpha mask
  const imageData = ctx.getImageData(0, 0, image.width, image.height);
  for (let i = 0; i < mask.data.length; i++) {
    imageData.data[i * 4 + 3] = mask.data[i];
  }
  ctx.putImageData(imageData, 0, 0);

  // Convert to blob and then to data URL
  const blob = await canvas.convertToBlob({ type: "image/png" });
  const reader = new FileReader();

  return new Promise((resolve) => {
    reader.onloadend = () => {
      sendProgress("Done", 100);
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "REMOVE_BG") {
    const sendProgress = (key, pct) => {
      chrome.runtime.sendMessage({ type: "PROGRESS", key, pct }).catch(() => {});
    };

    removeBackground(msg.imageData, sendProgress)
      .then(result => sendResponse({ success: true, data: result }))
      .catch(e => sendResponse({ success: false, error: e.message }));

    return true;
  }
});
