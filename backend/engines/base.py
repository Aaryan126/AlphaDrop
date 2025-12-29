"""
Base engine interface for background removal.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
import numpy as np


@dataclass
class EngineResult:
    """Result from a background removal engine."""

    rgba_image: np.ndarray  # Output image with transparency (H, W, 4)
    confidence: float  # Confidence score 0.0 - 1.0
    method: str  # Method name used

    def __post_init__(self):
        """Validate result."""
        # Convert numpy types to native Python float for JSON serialization
        self.confidence = float(self.confidence)

        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(f"Confidence must be between 0 and 1, got {self.confidence}")

        if len(self.rgba_image.shape) != 3 or self.rgba_image.shape[2] != 4:
            raise ValueError(f"Expected RGBA image (H, W, 4), got shape {self.rgba_image.shape}")


class BaseEngine(ABC):
    """Abstract base class for background removal engines."""

    name: str = "base"

    @abstractmethod
    def process(self, image: np.ndarray) -> EngineResult:
        """
        Remove background from image.

        Args:
            image: RGB image as numpy array (H, W, 3)

        Returns:
            EngineResult with RGBA image and confidence score
        """
        pass

    def validate_input(self, image: np.ndarray) -> None:
        """
        Validate input image format.

        Args:
            image: Input image array

        Raises:
            ValueError: If image format is invalid
        """
        if image is None:
            raise ValueError("Image cannot be None")

        if len(image.shape) != 3:
            raise ValueError(f"Expected 3D image array, got shape {image.shape}")

        if image.shape[2] != 3:
            raise ValueError(f"Expected RGB image with 3 channels, got {image.shape[2]}")
