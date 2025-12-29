"""
Auto-selection logic for choosing the best background removal method.
Uses rule-based analysis of image characteristics.
"""
import cv2
import numpy as np
from dataclasses import dataclass
from ..config import settings


@dataclass
class ImageAnalysis:
    """Results of image analysis."""

    has_face: bool
    color_entropy: float
    edge_density: float
    recommended_method: str

    def __post_init__(self):
        """Convert numpy types to native Python types for JSON serialization."""
        self.has_face = bool(self.has_face)
        self.color_entropy = float(self.color_entropy)
        self.edge_density = float(self.edge_density)


class AutoSelector:
    """
    Analyzes images and recommends the best removal method.

    Decision logic:
    1. Face detected → AI Matting (best for portraits)
    2. Low color entropy → Color-Based (uniform background)
    3. Default → AI Segmentation (general objects)
    """

    def __init__(self):
        """Initialize with OpenCV face detector."""
        # Use Haar cascade for fast face detection
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        )

    def analyze(self, image: np.ndarray) -> ImageAnalysis:
        """
        Analyze image and recommend best method.

        Args:
            image: RGB image (H, W, 3)

        Returns:
            ImageAnalysis with recommendations
        """
        # Convert to grayscale for analysis
        gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)

        # Run all analyses
        has_face = self._detect_face(gray)
        color_entropy = self._calculate_color_entropy(image)
        edge_density = self._calculate_edge_density(gray)

        # Decision logic
        if has_face:
            method = "matting"
        elif color_entropy < settings.entropy_threshold:
            method = "color"
        else:
            method = "segmentation"

        return ImageAnalysis(
            has_face=has_face,
            color_entropy=color_entropy,
            edge_density=edge_density,
            recommended_method=method,
        )

    def _detect_face(self, gray: np.ndarray) -> bool:
        """
        Detect if image contains a face.

        Uses OpenCV Haar cascade for fast detection.
        """
        # Resize for faster detection
        max_dim = 400
        h, w = gray.shape
        scale = min(max_dim / max(h, w), 1.0)
        if scale < 1.0:
            gray = cv2.resize(gray, None, fx=scale, fy=scale)

        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
        )

        return len(faces) > 0

    def _calculate_color_entropy(self, image: np.ndarray) -> float:
        """
        Calculate color entropy of the image.

        Lower entropy = more uniform colors = likely simple background.
        """
        # Convert to HSV and focus on hue
        hsv = cv2.cvtColor(image, cv2.COLOR_RGB2HSV)

        # Calculate histogram for each channel
        entropy_sum = 0.0
        for i in range(3):
            hist = cv2.calcHist([hsv], [i], None, [32], [0, 256])
            hist = hist.flatten() / hist.sum()  # Normalize

            # Calculate entropy
            hist = hist[hist > 0]  # Remove zeros
            entropy_sum += -np.sum(hist * np.log2(hist))

        return entropy_sum / 3.0  # Average entropy

    def _calculate_edge_density(self, gray: np.ndarray) -> float:
        """
        Calculate edge density of the image.

        Higher density = more complex scene.
        """
        # Apply Canny edge detection
        edges = cv2.Canny(gray, 100, 200)

        # Calculate ratio of edge pixels
        edge_pixels = np.sum(edges > 0)
        total_pixels = edges.size

        return edge_pixels / total_pixels


# Module-level convenience function
_selector = None


def select_method(image: np.ndarray) -> ImageAnalysis:
    """
    Analyze image and recommend best removal method.

    Args:
        image: RGB image (H, W, 3)

    Returns:
        ImageAnalysis with recommendation
    """
    global _selector
    if _selector is None:
        _selector = AutoSelector()

    return _selector.analyze(image)
