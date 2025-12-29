"""
AI Matting engine using rembg.
Best for portraits and images with soft edges (hair, fur).
"""
import numpy as np
from PIL import Image
from .base import BaseEngine, EngineResult

# Lazy load rembg to avoid slow startup
_rembg_session = None


def _get_session():
    """Lazily initialize rembg session."""
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session
        # Use u2net for general matting, good balance of quality/speed
        _rembg_session = new_session("u2net")
    return _rembg_session


class AIMattingEngine(BaseEngine):
    """
    AI-based matting engine using rembg with u2net model.

    Produces soft alpha mattes, ideal for:
    - Portraits
    - Hair and fur
    - Semi-transparent edges
    """

    name = "matting"

    def process(self, image: np.ndarray) -> EngineResult:
        """
        Remove background using AI matting.

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

            # Process with rembg
            session = _get_session()
            result = remove(
                pil_image,
                session=session,
                alpha_matting=True,
                alpha_matting_foreground_threshold=240,
                alpha_matting_background_threshold=10,
                alpha_matting_erode_size=10,
            )

            # Convert back to numpy
            rgba = np.array(result)

            # Calculate confidence based on alpha channel characteristics
            confidence = self._calculate_confidence(rgba)

            return EngineResult(rgba_image=rgba, confidence=confidence, method=self.name)

        except Exception as e:
            # Log error and return with low confidence
            print(f"AI Matting error: {e}")
            # Fallback: return image with full opacity
            rgba = np.zeros((image.shape[0], image.shape[1], 4), dtype=np.uint8)
            rgba[:, :, :3] = image
            rgba[:, :, 3] = 255
            return EngineResult(rgba_image=rgba, confidence=0.1, method=self.name)

    def _calculate_confidence(self, rgba: np.ndarray) -> float:
        """
        Calculate confidence based on alpha channel quality.

        Higher confidence if:
        - Alpha has meaningful variation (not all 0 or 255)
        - Foreground region is reasonable size
        """
        alpha = rgba[:, :, 3]
        total_pixels = alpha.size

        # Check if we have meaningful transparency
        fully_transparent = np.sum(alpha < 10)
        fully_opaque = np.sum(alpha > 245)
        semi_transparent = total_pixels - fully_transparent - fully_opaque

        # Ratio of semi-transparent pixels (soft edges)
        soft_edge_ratio = semi_transparent / total_pixels

        # Foreground ratio
        fg_ratio = np.sum(alpha > 127) / total_pixels

        # Good if we have some foreground (10-95%) and some soft edges
        if fg_ratio < 0.05 or fg_ratio > 0.98:
            base_confidence = 0.4
        else:
            base_confidence = 0.85

        # Bonus for soft edges (indicates good matting)
        soft_edge_bonus = min(0.15, soft_edge_ratio * 2)

        return min(1.0, base_confidence + soft_edge_bonus)
