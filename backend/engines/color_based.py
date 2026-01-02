"""
Color-based background removal engine.
Uses HSV analysis and morphological operations.
Best for logos, icons, and uniform backgrounds.
"""
import cv2
import numpy as np
from .base import BaseEngine, EngineResult


class ColorBasedEngine(BaseEngine):
    """
    Heuristic-based background removal using color analysis.

    Strategy:
    1. Analyze border pixels to detect background color
    2. Create mask based on color similarity
    3. Apply morphological cleanup
    4. Erode edges to remove border artifacts
    5. Apply guided filter for edge-aware smoothing
    """

    name = "color"

    def __init__(
        self,
        color_tolerance: int = 30,
        erode_iterations: int = 1,
        guided_radius: int = 4,
        guided_eps: float = 0.02,
    ):
        """
        Initialize color-based engine.

        Args:
            color_tolerance: HSV tolerance for background detection
            erode_iterations: Number of erosion passes to remove border artifacts
            guided_radius: Radius for guided filter smoothing
            guided_eps: Regularization for guided filter (higher = smoother)
        """
        self.color_tolerance = color_tolerance
        self.erode_iterations = erode_iterations
        self.guided_radius = guided_radius
        self.guided_eps = guided_eps

    def process(self, image: np.ndarray) -> EngineResult:
        """
        Remove background using color-based heuristics.

        Args:
            image: RGB image (H, W, 3)

        Returns:
            EngineResult with RGBA image
        """
        self.validate_input(image)

        # Convert to HSV for better color analysis
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)

        # Detect background color from border pixels
        bg_color = self._detect_background_color(hsv)

        # Create initial mask
        mask = self._create_color_mask(hsv, bg_color)

        # Morphological cleanup + edge refinement
        mask = self._cleanup_mask(mask, image)

        # Calculate confidence based on mask quality
        confidence = self._calculate_confidence(mask)

        # Create RGBA output
        rgba = self._apply_mask(image, mask)

        return EngineResult(rgba_image=rgba, confidence=confidence, method=self.name)

    def _detect_background_color(self, hsv: np.ndarray) -> np.ndarray:
        """
        Detect dominant background color from border pixels.

        Samples pixels from all four edges and finds the most common color.
        """
        h, w = hsv.shape[:2]
        border_size = max(5, min(h, w) // 20)  # 5% of smaller dimension

        # Collect border pixels
        top = hsv[:border_size, :].reshape(-1, 3)
        bottom = hsv[-border_size:, :].reshape(-1, 3)
        left = hsv[:, :border_size].reshape(-1, 3)
        right = hsv[:, -border_size:].reshape(-1, 3)

        border_pixels = np.vstack([top, bottom, left, right])

        # Find dominant color using histogram
        # Quantize to reduce noise
        quantized = (border_pixels // 10) * 10
        unique, counts = np.unique(quantized, axis=0, return_counts=True)

        # Return most common color
        dominant_idx = np.argmax(counts)
        return unique[dominant_idx]

    def _create_color_mask(self, hsv: np.ndarray, bg_color: np.ndarray) -> np.ndarray:
        """
        Create binary mask where background pixels are 0.
        """
        # Define tolerance ranges
        h_tol = self.color_tolerance
        s_tol = self.color_tolerance * 2
        v_tol = self.color_tolerance * 2

        lower = np.array([
            max(0, int(bg_color[0]) - h_tol),
            max(0, int(bg_color[1]) - s_tol),
            max(0, int(bg_color[2]) - v_tol)
        ])
        upper = np.array([
            min(179, int(bg_color[0]) + h_tol),
            min(255, int(bg_color[1]) + s_tol),
            min(255, int(bg_color[2]) + v_tol)
        ])

        # Create mask (background = 0, foreground = 255)
        bg_mask = cv2.inRange(hsv, lower, upper)
        fg_mask = cv2.bitwise_not(bg_mask)

        return fg_mask

    def _cleanup_mask(self, mask: np.ndarray, guide_image: np.ndarray) -> np.ndarray:
        """
        Apply morphological operations and edge-aware refinement.

        Args:
            mask: Binary foreground mask
            guide_image: Original RGB image for guided filter
        """
        # Remove small noise
        kernel_small = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_small)

        # Fill small holes
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_small)

        # Erode to remove border artifacts (thin halo around edges)
        if self.erode_iterations > 0:
            kernel_erode = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
            mask = cv2.erode(mask, kernel_erode, iterations=self.erode_iterations)

        # Apply guided filter for edge-aware smoothing
        mask = self._guided_filter(guide_image, mask)

        return mask

    def _guided_filter(self, guide: np.ndarray, src: np.ndarray) -> np.ndarray:
        """
        Edge-aware guided filter that smooths the mask while respecting image edges.

        Uses the original image as a guide to preserve object boundaries
        while smoothing the alpha mask.

        Args:
            guide: RGB guide image (H, W, 3)
            src: Grayscale mask to filter (H, W)

        Returns:
            Filtered mask with smooth, edge-aware boundaries
        """
        radius = self.guided_radius
        eps = self.guided_eps

        # Convert to float32 for precision
        guide_float = guide.astype(np.float32) / 255.0
        src_float = src.astype(np.float32) / 255.0

        # Convert guide to grayscale if color
        if len(guide_float.shape) == 3:
            guide_gray = cv2.cvtColor(guide_float, cv2.COLOR_RGB2GRAY)
        else:
            guide_gray = guide_float

        # Box filter helper (mean filter)
        ksize = 2 * radius + 1

        def box_filter(img):
            return cv2.blur(img, (ksize, ksize))

        # Compute local statistics
        mean_guide = box_filter(guide_gray)
        mean_src = box_filter(src_float)
        mean_guide_src = box_filter(guide_gray * src_float)
        mean_guide_guide = box_filter(guide_gray * guide_gray)

        # Compute covariance and variance
        cov_guide_src = mean_guide_src - mean_guide * mean_src
        var_guide = mean_guide_guide - mean_guide * mean_guide

        # Compute linear coefficients
        a = cov_guide_src / (var_guide + eps)
        b = mean_src - a * mean_guide

        # Compute means of coefficients
        mean_a = box_filter(a)
        mean_b = box_filter(b)

        # Compute output
        output = mean_a * guide_gray + mean_b

        # Convert back to uint8
        return (output * 255).clip(0, 255).astype(np.uint8)

    def _calculate_confidence(self, mask: np.ndarray) -> float:
        """
        Calculate confidence score based on mask characteristics.

        Higher confidence if:
        - Mask has clear foreground region
        - Edges are clean (not too noisy)
        """
        total_pixels = mask.size
        foreground_pixels = np.sum(mask > 127)

        # Foreground ratio (ideal: 10-90%)
        fg_ratio = foreground_pixels / total_pixels
        if fg_ratio < 0.05 or fg_ratio > 0.95:
            ratio_score = 0.3
        elif 0.1 <= fg_ratio <= 0.9:
            ratio_score = 1.0
        else:
            ratio_score = 0.7

        # Edge smoothness (fewer edge pixels = cleaner)
        edges = cv2.Canny(mask, 100, 200)
        edge_ratio = np.sum(edges > 0) / total_pixels
        edge_score = max(0.3, 1.0 - edge_ratio * 10)

        # Combined confidence
        confidence = (ratio_score * 0.6 + edge_score * 0.4)
        return min(1.0, max(0.0, confidence))

    def _apply_mask(self, image: np.ndarray, mask: np.ndarray) -> np.ndarray:
        """
        Apply mask as alpha channel to create RGBA image.
        """
        rgba = np.zeros((image.shape[0], image.shape[1], 4), dtype=np.uint8)
        rgba[:, :, :3] = image
        rgba[:, :, 3] = mask
        return rgba
