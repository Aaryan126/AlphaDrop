"""
AI Segmentation engine using rembg.
Best for general objects and product images.
"""
import logging
import numpy as np
from PIL import Image
from .base import BaseEngine, EngineResult

logger = logging.getLogger(__name__)

# Lazy load rembg session
_rembg_session = None


def _get_session():
    """Lazily initialize rembg session for segmentation."""
    global _rembg_session
    if _rembg_session is None:
        logger.info("Loading isnet-general-use model for segmentation (first run may download ~170MB)...")
        from rembg import new_session
        # Use isnet-general-use for better object segmentation
        _rembg_session = new_session("isnet-general-use")
        logger.info("isnet-general-use model loaded successfully")
    return _rembg_session


class AISegmentationEngine(BaseEngine):
    """
    AI-based segmentation engine using rembg with IS-Net model.

    Produces binary masks, ideal for:
    - Products
    - Objects
    - Clear boundaries
    """

    name = "segmentation"

    def process(self, image: np.ndarray) -> EngineResult:
        """
        Remove background using AI segmentation.

        Args:
            image: RGB image (H, W, 3)

        Returns:
            EngineResult with RGBA image
        """
        self.validate_input(image)

        try:
            from rembg import remove

            # Convert to PIL for rembg
            pil_image = Image.fromarray(image)

            # Process with rembg (no alpha matting for sharper edges)
            session = _get_session()
            logger.info(f"Running segmentation on image {image.shape[1]}x{image.shape[0]}...")
            result = remove(
                pil_image,
                session=session,
                alpha_matting=False,  # Binary mask for clean edges
            )
            logger.info("Segmentation complete")

            # Convert back to numpy
            rgba = np.array(result)

            # Binarize alpha for cleaner segmentation
            rgba = self._binarize_alpha(rgba)

            # Calculate confidence
            confidence = self._calculate_confidence(rgba)

            return EngineResult(rgba_image=rgba, confidence=confidence, method=self.name)

        except Exception as e:
            # Log error and return with low confidence
            print(f"AI Segmentation error: {e}")
            # Fallback: return image with full opacity
            rgba = np.zeros((image.shape[0], image.shape[1], 4), dtype=np.uint8)
            rgba[:, :, :3] = image
            rgba[:, :, 3] = 255
            return EngineResult(rgba_image=rgba, confidence=0.1, method=self.name)

    def _binarize_alpha(self, rgba: np.ndarray, threshold: int = 127) -> np.ndarray:
        """
        Convert alpha channel to binary (0 or 255).
        Produces cleaner edges for object segmentation.
        """
        result = rgba.copy()
        result[:, :, 3] = np.where(rgba[:, :, 3] > threshold, 255, 0).astype(np.uint8)
        return result

    def _calculate_confidence(self, rgba: np.ndarray) -> float:
        """
        Calculate confidence based on segmentation quality.

        Higher confidence if:
        - Clear foreground/background separation
        - Reasonable foreground size
        - Connected foreground region
        """
        alpha = rgba[:, :, 3]
        total_pixels = alpha.size

        # Foreground ratio
        fg_pixels = np.sum(alpha > 127)
        fg_ratio = fg_pixels / total_pixels

        # Ideal foreground ratio is 5-90%
        if fg_ratio < 0.03 or fg_ratio > 0.97:
            return 0.3  # Almost all foreground or background
        elif 0.05 <= fg_ratio <= 0.9:
            return 0.9
        else:
            return 0.7
