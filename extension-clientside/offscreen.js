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

// ============================================
// Phase 1: Enhanced Post-Processing Pipeline
// ============================================

/**
 * Guided Filter implementation for edge-aware mask refinement.
 * Uses the original RGB image as a guide to preserve edges while smoothing.
 * Based on "Guided Image Filtering" by He et al.
 *
 * @param {Uint8Array} mask - Input mask (0-255)
 * @param {Uint8ClampedArray} rgbData - Original image RGBA data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} radius - Filter radius (default 8)
 * @param {number} eps - Regularization parameter (default 0.01)
 * @returns {Float32Array} - Refined mask (0-1)
 */
function guidedFilter(mask, rgbData, width, height, radius = 8, eps = 0.01) {
  const size = width * height;

  // Convert mask to float (0-1)
  const p = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    p[i] = mask[i] / 255;
  }

  // Convert RGB to grayscale guide (0-1)
  const I = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const idx = i * 4;
    I[i] = (rgbData[idx] * 0.299 + rgbData[idx + 1] * 0.587 + rgbData[idx + 2] * 0.114) / 255;
  }

  // Compute box filter means
  const meanI = boxFilter(I, width, height, radius);
  const meanP = boxFilter(p, width, height, radius);
  const meanIP = boxFilter(multiply(I, p), width, height, radius);
  const meanII = boxFilter(multiply(I, I), width, height, radius);

  // Compute covariance and variance
  const covIP = new Float32Array(size);
  const varI = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    covIP[i] = meanIP[i] - meanI[i] * meanP[i];
    varI[i] = meanII[i] - meanI[i] * meanI[i];
  }

  // Compute linear coefficients a and b
  const a = new Float32Array(size);
  const b = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    a[i] = covIP[i] / (varI[i] + eps);
    b[i] = meanP[i] - a[i] * meanI[i];
  }

  // Compute mean of a and b
  const meanA = boxFilter(a, width, height, radius);
  const meanB = boxFilter(b, width, height, radius);

  // Compute output: q = meanA * I + meanB
  const q = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    q[i] = Math.max(0, Math.min(1, meanA[i] * I[i] + meanB[i]));
  }

  return q;
}

/**
 * Fast box filter using integral images (summed area table).
 */
function boxFilter(src, width, height, radius) {
  const size = width * height;
  const dst = new Float32Array(size);

  // Create integral image
  const integral = new Float32Array((width + 1) * (height + 1));

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += src[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] =
        rowSum + integral[y * (width + 1) + (x + 1)];
    }
  }

  // Compute box filter using integral image
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const x1 = Math.max(0, x - radius);
      const y1 = Math.max(0, y - radius);
      const x2 = Math.min(width - 1, x + radius);
      const y2 = Math.min(height - 1, y + radius);

      const count = (x2 - x1 + 1) * (y2 - y1 + 1);

      const sum = integral[(y2 + 1) * (width + 1) + (x2 + 1)]
                - integral[(y2 + 1) * (width + 1) + x1]
                - integral[y1 * (width + 1) + (x2 + 1)]
                + integral[y1 * (width + 1) + x1];

      dst[y * width + x] = sum / count;
    }
  }

  return dst;
}

/**
 * Element-wise multiplication of two arrays.
 */
function multiply(a, b) {
  const result = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) {
    result[i] = a[i] * b[i];
  }
  return result;
}

/**
 * Detect uncertain regions in the mask where edge refinement is needed.
 * Returns a map indicating confidence: 0 = uncertain (needs refinement), 1 = certain
 *
 * @param {Float32Array} mask - Mask values (0-1)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} lowThresh - Lower threshold for uncertainty (default 0.1)
 * @param {number} highThresh - Upper threshold for uncertainty (default 0.9)
 * @returns {Float32Array} - Uncertainty map (0 = uncertain, 1 = certain)
 */
function detectUncertainty(mask, width, height, lowThresh = 0.1, highThresh = 0.9) {
  const size = width * height;
  const uncertainty = new Float32Array(size);

  for (let i = 0; i < size; i++) {
    const val = mask[i];
    if (val > lowThresh && val < highThresh) {
      // Uncertain region - needs refinement
      uncertainty[i] = 0;
    } else {
      // Certain region
      uncertainty[i] = 1;
    }
  }

  // Dilate uncertain regions to include nearby edges
  const dilated = dilateUncertainty(uncertainty, width, height, 3);

  return dilated;
}

/**
 * Dilate the uncertain regions to capture nearby edge pixels.
 */
function dilateUncertainty(uncertainty, width, height, radius) {
  const result = new Float32Array(uncertainty);

  for (let y = radius; y < height - radius; y++) {
    for (let x = radius; x < width - radius; x++) {
      const idx = y * width + x;

      // If any neighbor is uncertain (0), mark this as uncertain too
      if (uncertainty[idx] === 1) {
        let hasUncertainNeighbor = false;

        outer: for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            if (uncertainty[(y + dy) * width + (x + dx)] === 0) {
              hasUncertainNeighbor = true;
              break outer;
            }
          }
        }

        if (hasUncertainNeighbor) {
          result[idx] = 0;
        }
      }
    }
  }

  return result;
}

/**
 * Compute image gradients using Sobel operator.
 * Returns gradient magnitude normalized to 0-1.
 */
function computeGradients(rgbData, width, height) {
  const size = width * height;
  const gray = new Float32Array(size);

  // Convert to grayscale
  for (let i = 0; i < size; i++) {
    const idx = i * 4;
    gray[i] = (rgbData[idx] * 0.299 + rgbData[idx + 1] * 0.587 + rgbData[idx + 2] * 0.114) / 255;
  }

  const gradients = new Float32Array(size);

  // Sobel kernels
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      let k = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const val = gray[(y + dy) * width + (x + dx)];
          gx += val * sobelX[k];
          gy += val * sobelY[k];
          k++;
        }
      }

      // Gradient magnitude
      gradients[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  // Normalize to 0-1
  let maxGrad = 0;
  for (let i = 0; i < size; i++) {
    if (gradients[i] > maxGrad) maxGrad = gradients[i];
  }

  if (maxGrad > 0) {
    for (let i = 0; i < size; i++) {
      gradients[i] /= maxGrad;
    }
  }

  return gradients;
}

/**
 * Apply gradient-aware feathering to mask edges.
 * Soft edges follow image gradients for natural transitions.
 *
 * @param {Float32Array} mask - Input mask (0-1)
 * @param {Float32Array} gradients - Image gradient magnitudes (0-1)
 * @param {Float32Array} uncertainty - Uncertainty map
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} featherRadius - Maximum feather radius (default 4)
 * @returns {Float32Array} - Feathered mask (0-1)
 */
function gradientAwareFeathering(mask, gradients, uncertainty, width, height, featherRadius = 4) {
  const size = width * height;
  const result = new Float32Array(mask);

  // Find edge pixels (where mask transitions)
  const isEdge = new Uint8Array(size);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const val = mask[idx];

      // Check if this is an edge pixel
      const neighbors = [
        mask[idx - 1], mask[idx + 1],
        mask[idx - width], mask[idx + width]
      ];

      for (const n of neighbors) {
        if (Math.abs(val - n) > 0.1) {
          isEdge[idx] = 1;
          break;
        }
      }
    }
  }

  // Apply feathering only at edges, modulated by gradient
  for (let y = featherRadius; y < height - featherRadius; y++) {
    for (let x = featherRadius; x < width - featherRadius; x++) {
      const idx = y * width + x;

      // Only process uncertain/edge regions
      if (uncertainty[idx] > 0.5 && !isEdge[idx]) continue;

      // Gradient at this pixel determines feather strength
      // High gradient = sharp edge (less feathering)
      // Low gradient = soft edge (more feathering)
      const grad = gradients[idx];
      const adaptiveRadius = Math.round(featherRadius * (1 - grad * 0.7));

      if (adaptiveRadius < 1) continue;

      // Weighted average with distance falloff
      let sum = 0;
      let weightSum = 0;

      for (let dy = -adaptiveRadius; dy <= adaptiveRadius; dy++) {
        for (let dx = -adaptiveRadius; dx <= adaptiveRadius; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > adaptiveRadius) continue;

          const nIdx = (y + dy) * width + (x + dx);
          const weight = 1 - (dist / adaptiveRadius);

          sum += mask[nIdx] * weight;
          weightSum += weight;
        }
      }

      if (weightSum > 0) {
        result[idx] = sum / weightSum;
      }
    }
  }

  return result;
}

/**
 * Bilinear upscale for mask - better quality than nearest neighbor.
 */
function bilinearUpscale(src, srcWidth, srcHeight, dstWidth, dstHeight) {
  const dst = new Float32Array(dstWidth * dstHeight);

  const xRatio = srcWidth / dstWidth;
  const yRatio = srcHeight / dstHeight;

  for (let y = 0; y < dstHeight; y++) {
    for (let x = 0; x < dstWidth; x++) {
      const srcX = x * xRatio;
      const srcY = y * yRatio;

      const x1 = Math.floor(srcX);
      const y1 = Math.floor(srcY);
      const x2 = Math.min(x1 + 1, srcWidth - 1);
      const y2 = Math.min(y1 + 1, srcHeight - 1);

      const xFrac = srcX - x1;
      const yFrac = srcY - y1;

      const v11 = src[y1 * srcWidth + x1];
      const v12 = src[y1 * srcWidth + x2];
      const v21 = src[y2 * srcWidth + x1];
      const v22 = src[y2 * srcWidth + x2];

      const v1 = v11 * (1 - xFrac) + v12 * xFrac;
      const v2 = v21 * (1 - xFrac) + v22 * xFrac;

      dst[y * dstWidth + x] = v1 * (1 - yFrac) + v2 * yFrac;
    }
  }

  return dst;
}

/**
 * Main post-processing pipeline for mask refinement.
 *
 * @param {Uint8Array} rawMask - Raw mask from model (0-255)
 * @param {number} maskWidth - Mask width (model output size)
 * @param {number} maskHeight - Mask height (model output size)
 * @param {Uint8ClampedArray} rgbData - Original image RGBA data
 * @param {number} imageWidth - Original image width
 * @param {number} imageHeight - Original image height
 * @returns {Uint8Array} - Refined mask at original resolution (0-255)
 */
function refineMask(rawMask, maskWidth, maskHeight, rgbData, imageWidth, imageHeight) {
  // Step 1: Convert raw mask to float (0-1)
  const maskFloat = new Float32Array(maskWidth * maskHeight);
  for (let i = 0; i < rawMask.length; i++) {
    maskFloat[i] = rawMask[i] / 255;
  }

  // Step 2: Detect uncertain regions at model resolution
  const uncertaintySmall = detectUncertainty(maskFloat, maskWidth, maskHeight);

  // Step 3: Bilinear upscale mask to original resolution
  const upscaledMask = bilinearUpscale(maskFloat, maskWidth, maskHeight, imageWidth, imageHeight);

  // Step 4: Upscale uncertainty map
  const uncertainty = bilinearUpscale(uncertaintySmall, maskWidth, maskHeight, imageWidth, imageHeight);

  // Step 5: Convert upscaled mask to Uint8 for guided filter
  const maskUint8 = new Uint8Array(imageWidth * imageHeight);
  for (let i = 0; i < upscaledMask.length; i++) {
    maskUint8[i] = Math.round(upscaledMask[i] * 255);
  }

  // Step 6: Apply guided filter using original RGB as guide
  const guidedMask = guidedFilter(maskUint8, rgbData, imageWidth, imageHeight, 8, 0.001);

  // Step 7: Compute image gradients for feathering
  const gradients = computeGradients(rgbData, imageWidth, imageHeight);

  // Step 8: Apply gradient-aware feathering
  const featheredMask = gradientAwareFeathering(guidedMask, gradients, uncertainty, imageWidth, imageHeight, 4);

  // Step 9: Convert back to Uint8Array (0-255)
  const finalMask = new Uint8Array(imageWidth * imageHeight);
  for (let i = 0; i < featheredMask.length; i++) {
    finalMask[i] = Math.round(Math.max(0, Math.min(1, featheredMask[i])) * 255);
  }

  return finalMask;
}

async function removeBackground(imageDataUrl, sendProgress) {
  await loadModel(sendProgress);

  sendProgress("Processing image", 0);

  // Load image from data URL
  const image = await RawImage.fromURL(imageDataUrl);

  sendProgress("Processing image", 20);

  // Prepare inputs
  const { pixel_values } = await processor(image);

  sendProgress("Running AI model", 35);

  // Run model
  const { output } = await model({ input: pixel_values });

  sendProgress("Running AI model", 50);

  // Get raw mask at model resolution (before any resizing)
  const rawMaskTensor = output[0].mul(255).to("uint8");
  const rawMaskImage = await RawImage.fromTensor(rawMaskTensor);
  const rawMask = rawMaskImage.data;
  const maskWidth = rawMaskImage.width;
  const maskHeight = rawMaskImage.height;

  sendProgress("Refining edges", 60);

  // Create canvas and get original image data
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");

  // Draw original image
  const imgBitmap = await createImageBitmap(await (await fetch(imageDataUrl)).blob());
  ctx.drawImage(imgBitmap, 0, 0);

  // Get original image RGBA data for guided filtering
  const imageData = ctx.getImageData(0, 0, image.width, image.height);

  sendProgress("Refining edges", 70);

  // Apply enhanced post-processing pipeline
  const refinedMask = refineMask(
    rawMask,
    maskWidth,
    maskHeight,
    imageData.data,
    image.width,
    image.height
  );

  sendProgress("Applying mask", 90);

  // Apply refined mask as alpha channel
  for (let i = 0; i < refinedMask.length; i++) {
    imageData.data[i * 4 + 3] = refinedMask[i];
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
