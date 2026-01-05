import { AutoModel, AutoProcessor, env, RawImage } from "@huggingface/transformers";

// Configure Transformers.js for Chrome extension compatibility
env.allowLocalModels = false;
env.useBrowserCache = true;

// Disable Web Worker proxy to avoid blob URL CSP issues
env.backends.onnx.wasm.proxy = false;

// Use local WASM files instead of CDN
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("/");

// Suppress ONNX Runtime warnings about node assignments
// These warnings are informational and don't affect output quality
env.backends.onnx.logLevel = "error";  // Only show errors, not warnings

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
 * Color defringing: Replace contaminated edge pixel colors with nearby foreground colors.
 *
 * For semi-transparent pixels (edges), their RGB values contain a blend of foreground
 * and background colors. This function replaces those contaminated RGB values with
 * colors sampled from nearby fully-opaque foreground pixels, eliminating the
 * "halo" or "fringe" effect when composited on a new background.
 *
 * @param {ImageData} imageData - Image data with alpha channel already applied
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} searchRadius - How far to search for foreground colors (default 10)
 * @param {number} alphaLow - Lower alpha threshold for edge detection (default 5)
 * @param {number} alphaHigh - Upper alpha threshold for edge detection (default 250)
 */
function defringe(imageData, width, height, searchRadius = 10, alphaLow = 5, alphaHigh = 250) {
  const data = imageData.data;
  const size = width * height;

  // Step 1: Build a map of foreground pixel locations for fast lookup
  // Foreground = fully opaque pixels (alpha >= alphaHigh)
  const isForeground = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if (data[i * 4 + 3] >= alphaHigh) {
      isForeground[i] = 1;
    }
  }

  // Step 2: For each edge pixel, find nearest foreground pixel and copy its color
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const alpha = data[idx * 4 + 3];

      // Skip fully transparent and fully opaque pixels
      if (alpha <= alphaLow || alpha >= alphaHigh) continue;

      // This is an edge pixel - find nearest foreground pixel
      let bestDist = Infinity;
      let bestR = data[idx * 4];
      let bestG = data[idx * 4 + 1];
      let bestB = data[idx * 4 + 2];
      let found = false;

      // Search in expanding squares for efficiency
      for (let r = 1; r <= searchRadius && !found; r++) {
        // Check pixels at distance r (square perimeter)
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            // Only check perimeter pixels at this radius
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;

            const ny = y + dy;
            const nx = x + dx;

            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;

            const nIdx = ny * width + nx;
            if (isForeground[nIdx]) {
              const dist = dx * dx + dy * dy;
              if (dist < bestDist) {
                bestDist = dist;
                bestR = data[nIdx * 4];
                bestG = data[nIdx * 4 + 1];
                bestB = data[nIdx * 4 + 2];
                found = true;
              }
            }
          }
        }
      }

      // If no foreground found nearby, try a wider weighted average approach
      if (!found) {
        let sumR = 0, sumG = 0, sumB = 0, sumWeight = 0;

        for (let dy = -searchRadius; dy <= searchRadius; dy++) {
          for (let dx = -searchRadius; dx <= searchRadius; dx++) {
            const ny = y + dy;
            const nx = x + dx;

            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;

            const nIdx = ny * width + nx;
            const nAlpha = data[nIdx * 4 + 3];

            // Weight by alpha (prefer more opaque pixels) and inverse distance
            if (nAlpha > alpha) {
              const dist = Math.sqrt(dx * dx + dy * dy) + 1;
              const weight = (nAlpha / 255) / dist;

              sumR += data[nIdx * 4] * weight;
              sumG += data[nIdx * 4 + 1] * weight;
              sumB += data[nIdx * 4 + 2] * weight;
              sumWeight += weight;
            }
          }
        }

        if (sumWeight > 0) {
          bestR = Math.round(sumR / sumWeight);
          bestG = Math.round(sumG / sumWeight);
          bestB = Math.round(sumB / sumWeight);
        }
      }

      // Replace the edge pixel's RGB with the foreground color (keep alpha)
      data[idx * 4] = bestR;
      data[idx * 4 + 1] = bestG;
      data[idx * 4 + 2] = bestB;
    }
  }
}

// ============================================
// Phase 2: Trimap-Based Alpha Refinement
// Based on rembg/PyMatting approach
// ============================================

/**
 * Binary erosion - shrinks regions by removing boundary pixels.
 * Similar to scipy.ndimage.binary_erosion.
 *
 * @param {Uint8Array} mask - Binary mask (0 or 1)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} radius - Erosion radius (structure element size)
 * @param {number} borderValue - Value to use for pixels outside boundary (0 or 1)
 * @returns {Uint8Array} - Eroded binary mask
 */
function binaryErosion(mask, width, height, radius, borderValue = 0) {
  const result = new Uint8Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // If the pixel is already 0, it stays 0
      if (mask[idx] === 0) {
        result[idx] = 0;
        continue;
      }

      // Check all neighbors in the structuring element
      let allOnes = true;

      for (let dy = -radius; dy <= radius && allOnes; dy++) {
        for (let dx = -radius; dx <= radius && allOnes; dx++) {
          const ny = y + dy;
          const nx = x + dx;

          // Handle boundary
          if (ny < 0 || ny >= height || nx < 0 || nx >= width) {
            if (borderValue === 0) {
              allOnes = false;
            }
          } else {
            if (mask[ny * width + nx] === 0) {
              allOnes = false;
            }
          }
        }
      }

      result[idx] = allOnes ? 1 : 0;
    }
  }

  return result;
}

/**
 * Create a trimap from a mask using erosion.
 * Trimap has three regions:
 * - 255: Definite foreground (eroded high-confidence foreground)
 * - 0: Definite background (eroded high-confidence background)
 * - 128: Unknown region (needs refinement)
 *
 * @param {Uint8Array} mask - Input mask (0-255)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} foregroundThreshold - Threshold for definite foreground (default 240)
 * @param {number} backgroundThreshold - Threshold for definite background (default 10)
 * @param {number} erodeSize - Erosion radius (default 5)
 * @returns {Uint8Array} - Trimap (0, 128, or 255)
 */
function createTrimap(mask, width, height, foregroundThreshold = 240, backgroundThreshold = 10, erodeSize = 5) {
  const size = width * height;

  // Create binary masks for foreground and background
  const isForeground = new Uint8Array(size);
  const isBackground = new Uint8Array(size);

  for (let i = 0; i < size; i++) {
    isForeground[i] = mask[i] > foregroundThreshold ? 1 : 0;
    isBackground[i] = mask[i] < backgroundThreshold ? 1 : 0;
  }

  // Erode both regions to create definite areas
  const erodedForeground = binaryErosion(isForeground, width, height, erodeSize, 0);
  const erodedBackground = binaryErosion(isBackground, width, height, erodeSize, 1);

  // Build trimap
  const trimap = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    if (erodedForeground[i] === 1) {
      trimap[i] = 255; // Definite foreground
    } else if (erodedBackground[i] === 1) {
      trimap[i] = 0; // Definite background
    } else {
      trimap[i] = 128; // Unknown - needs refinement
    }
  }

  return trimap;
}

/**
 * Sample representative colors from foreground and background regions.
 * Uses K-means-like clustering to find dominant colors.
 *
 * @param {Uint8ClampedArray} rgbData - Image RGBA data
 * @param {Uint8Array} trimap - Trimap (0, 128, 255)
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {number} maxSamples - Maximum samples per region
 * @returns {Object} - { foreground: [[r,g,b], ...], background: [[r,g,b], ...] }
 */
function sampleRegionColors(rgbData, trimap, width, height, maxSamples = 1000) {
  const size = width * height;
  const fgColors = [];
  const bgColors = [];

  // Collect colors from definite regions (sample evenly)
  const fgIndices = [];
  const bgIndices = [];

  for (let i = 0; i < size; i++) {
    if (trimap[i] === 255) fgIndices.push(i);
    else if (trimap[i] === 0) bgIndices.push(i);
  }

  // Sample foreground colors
  const fgStep = Math.max(1, Math.floor(fgIndices.length / maxSamples));
  for (let i = 0; i < fgIndices.length; i += fgStep) {
    const idx = fgIndices[i] * 4;
    fgColors.push([rgbData[idx], rgbData[idx + 1], rgbData[idx + 2]]);
  }

  // Sample background colors
  const bgStep = Math.max(1, Math.floor(bgIndices.length / maxSamples));
  for (let i = 0; i < bgIndices.length; i += bgStep) {
    const idx = bgIndices[i] * 4;
    bgColors.push([rgbData[idx], rgbData[idx + 1], rgbData[idx + 2]]);
  }

  return { foreground: fgColors, background: bgColors };
}

/**
 * Calculate color distance between two RGB colors.
 * Uses weighted Euclidean distance in RGB space.
 */
function colorDistance(c1, c2) {
  // Weighted RGB distance (human eye is more sensitive to green)
  const dr = c1[0] - c2[0];
  const dg = c1[1] - c2[1];
  const db = c1[2] - c2[2];
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

/**
 * Find minimum distance from a color to a set of colors.
 */
function minDistanceToSet(color, colorSet) {
  let minDist = Infinity;
  for (const c of colorSet) {
    const dist = colorDistance(color, c);
    if (dist < minDist) minDist = dist;
  }
  return minDist;
}

/**
 * Refine alpha values in unknown regions using color similarity.
 * For each unknown pixel, estimate alpha based on whether its color
 * is more similar to foreground or background samples.
 *
 * @param {Float32Array} mask - Input mask (0-1)
 * @param {Uint8Array} trimap - Trimap (0, 128, 255)
 * @param {Uint8ClampedArray} rgbData - Image RGBA data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} samples - { foreground: [...], background: [...] }
 * @returns {Float32Array} - Refined mask (0-1)
 */
function refineUnknownRegions(mask, trimap, rgbData, width, height, samples) {
  const size = width * height;
  const result = new Float32Array(mask);

  // Skip if we don't have enough samples
  if (samples.foreground.length < 10 || samples.background.length < 10) {
    return result;
  }

  for (let i = 0; i < size; i++) {
    // Only refine unknown regions
    if (trimap[i] !== 128) continue;

    const idx4 = i * 4;
    const pixelColor = [rgbData[idx4], rgbData[idx4 + 1], rgbData[idx4 + 2]];

    // Calculate distance to foreground and background color sets
    const distToFg = minDistanceToSet(pixelColor, samples.foreground);
    const distToBg = minDistanceToSet(pixelColor, samples.background);

    // Compute alpha based on relative distances
    // If closer to foreground, alpha is higher
    const totalDist = distToFg + distToBg + 0.001; // Avoid division by zero
    const colorBasedAlpha = distToBg / totalDist;

    // Blend with original mask value (don't completely override)
    // Use original mask as a prior, color similarity as evidence
    const originalAlpha = mask[i];
    const blendWeight = 0.6; // How much to trust color-based alpha
    result[i] = originalAlpha * (1 - blendWeight) + colorBasedAlpha * blendWeight;

    // Clamp to valid range
    result[i] = Math.max(0, Math.min(1, result[i]));
  }

  return result;
}

/**
 * Full trimap-based alpha matting pipeline.
 * Creates a trimap, samples colors, and refines unknown regions.
 *
 * @param {Float32Array} mask - Input mask (0-1)
 * @param {Uint8ClampedArray} rgbData - Image RGBA data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Object} options - Configuration options
 * @returns {Float32Array} - Refined mask (0-1)
 */
function trimapAlphaMatting(mask, rgbData, width, height, options = {}) {
  const {
    foregroundThreshold = 240,
    backgroundThreshold = 10,
    erodeSize = 5
  } = options;

  // Convert mask to 0-255 for trimap creation
  const mask255 = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) {
    mask255[i] = Math.round(mask[i] * 255);
  }

  // Create trimap
  const trimap = createTrimap(mask255, width, height, foregroundThreshold, backgroundThreshold, erodeSize);

  // Sample colors from definite regions
  const samples = sampleRegionColors(rgbData, trimap, width, height);

  // Refine unknown regions based on color similarity
  const refinedMask = refineUnknownRegions(mask, trimap, rgbData, width, height, samples);

  return refinedMask;
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
 * @param {string} method - Processing method: 'matting' (soft edges) or 'segmentation' (hard edges)
 * @returns {Uint8Array} - Refined mask at original resolution (0-255)
 */
function refineMask(rawMask, maskWidth, maskHeight, rgbData, imageWidth, imageHeight, method = 'matting') {
  // Method-specific parameters
  // 'matting' = soft edges, preserves fine details (hair, fur)
  // 'segmentation' = hard edges, clean cutouts (products, objects)
  const isSegmentation = method === 'segmentation';

  const params = isSegmentation ? {
    // Segmentation: aggressive cleanup for hard edges
    guidedFilterRadius: 4,        // Smaller radius = sharper edges
    guidedFilterEps: 0.01,        // Higher eps = less edge-aware (smoother)
    trimapFgThreshold: 200,       // Lower = more aggressive foreground
    trimapBgThreshold: 30,        // Higher = more aggressive background
    trimapErodeSize: 8,           // Larger erosion = cleaner edges
    featherRadius: 2,             // Less feathering
    hardenEdges: true,            // Apply edge hardening pass
  } : {
    // Matting: preserve fine details, soft edges
    guidedFilterRadius: 8,        // Larger radius = preserves more detail
    guidedFilterEps: 0.001,       // Lower eps = more edge-aware
    trimapFgThreshold: 240,       // Standard thresholds
    trimapBgThreshold: 10,
    trimapErodeSize: 5,           // Standard erosion
    featherRadius: 4,             // More feathering for soft edges
    hardenEdges: false,
  };
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
  const guidedMask = guidedFilter(maskUint8, rgbData, imageWidth, imageHeight, params.guidedFilterRadius, params.guidedFilterEps);

  // Step 7: Apply trimap-based alpha matting refinement
  // This creates definite FG/BG regions via erosion, then refines
  // unknown regions based on color similarity to sampled FG/BG colors
  const trimapRefinedMask = trimapAlphaMatting(guidedMask, rgbData, imageWidth, imageHeight, {
    foregroundThreshold: params.trimapFgThreshold,
    backgroundThreshold: params.trimapBgThreshold,
    erodeSize: params.trimapErodeSize
  });

  // Step 8: Compute image gradients for feathering
  const gradients = computeGradients(rgbData, imageWidth, imageHeight);

  // Step 9: Apply gradient-aware feathering
  const featheredMask = gradientAwareFeathering(trimapRefinedMask, gradients, uncertainty, imageWidth, imageHeight, params.featherRadius);

  // Step 10: Convert back to Uint8Array (0-255)
  const finalMask = new Uint8Array(imageWidth * imageHeight);
  for (let i = 0; i < featheredMask.length; i++) {
    let value = Math.max(0, Math.min(1, featheredMask[i]));

    // Step 10b: For segmentation mode, harden edges by pushing values toward 0 or 1
    if (params.hardenEdges) {
      // Apply sigmoid-like curve to push mid-values toward extremes
      // This creates cleaner, more defined edges
      if (value > 0.1 && value < 0.9) {
        value = value < 0.5 ? value * 0.5 : 1 - (1 - value) * 0.5;
      }
      // Additional threshold to eliminate very faint edges
      if (value < 0.15) value = 0;
      if (value > 0.85) value = 1;
    }

    finalMask[i] = Math.round(value * 255);
  }

  return finalMask;
}

async function removeBackground(imageDataUrl, sendProgress, method = 'matting') {
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

  sendProgress("Refining edges", 65);

  // Apply enhanced post-processing pipeline with method-specific parameters
  const refinedMask = refineMask(
    rawMask,
    maskWidth,
    maskHeight,
    imageData.data,
    image.width,
    image.height,
    method
  );

  sendProgress("Applying mask", 88);

  // Apply refined mask as alpha channel
  for (let i = 0; i < refinedMask.length; i++) {
    imageData.data[i * 4 + 3] = refinedMask[i];
  }

  sendProgress("Cleaning edges", 94);

  // Apply color defringing to remove background color contamination from edge pixels
  // This replaces the RGB of semi-transparent pixels with colors from nearby opaque foreground
  // For segmentation mode, use tighter alpha thresholds for more aggressive cleanup
  const isSegmentation = method === 'segmentation';
  const defringeAlphaLow = isSegmentation ? 10 : 5;    // Higher = more aggressive
  const defringeAlphaHigh = isSegmentation ? 240 : 250; // Lower = more aggressive
  defringe(imageData, image.width, image.height, 10, defringeAlphaLow, defringeAlphaHigh);

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

    // Pass method to removeBackground ('matting' for soft edges, 'segmentation' for hard edges)
    const method = msg.method || 'matting';
    removeBackground(msg.imageData, sendProgress, method)
      .then(async (result) => {
        // Save result to storage for recovery if popup closed during processing
        try {
          const stored = await chrome.storage.local.get("processingState");
          const processingState = stored?.processingState;

          // Only save if there's a valid processing state that's still in "processing" status
          // This prevents overwriting if user started a new image or cleared state
          if (processingState &&
              processingState.status === "processing" &&
              processingState.originalImage) {
            const resultBase64 = result.replace(/^data:image\/png;base64,/, "");
            await chrome.storage.local.set({
              processingState: {
                ...processingState,
                resultBase64: resultBase64,
                status: "completed",
                completedAt: Date.now()
              }
            });
            console.log("AlphaDrop: Result saved to storage for recovery");
          }
        } catch (e) {
          // Non-critical - popup might still be open to receive result
          console.log("AlphaDrop: Could not save result to storage:", e?.message || e);
        }

        sendResponse({ success: true, data: result });
      })
      .catch(e => sendResponse({ success: false, error: e?.message || "Processing failed" }));

    return true;
  }
});
