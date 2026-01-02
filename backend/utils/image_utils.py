"""
Image loading and conversion utilities.
"""
import base64
import io
from PIL import Image
import numpy as np

# Enable AVIF support
import pillow_avif  # noqa: F401


def load_image(file_bytes: bytes) -> np.ndarray:
    """
    Load image from bytes and convert to RGB numpy array.

    Args:
        file_bytes: Raw image file bytes

    Returns:
        RGB image as numpy array (H, W, 3)
    """
    image = Image.open(io.BytesIO(file_bytes))

    # Convert to RGB if necessary
    if image.mode == "RGBA":
        # Create white background for transparency
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.split()[3])
        image = background
    elif image.mode != "RGB":
        image = image.convert("RGB")

    return np.array(image)


def rgba_to_png_bytes(rgba_image: np.ndarray) -> bytes:
    """
    Convert RGBA numpy array to PNG bytes.

    Args:
        rgba_image: RGBA image as numpy array (H, W, 4)

    Returns:
        PNG file bytes
    """
    image = Image.fromarray(rgba_image, mode="RGBA")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def encode_png_base64(rgba_image: np.ndarray) -> str:
    """
    Convert RGBA numpy array to base64-encoded PNG string.

    Args:
        rgba_image: RGBA image as numpy array (H, W, 4)

    Returns:
        Base64-encoded PNG string
    """
    png_bytes = rgba_to_png_bytes(rgba_image)
    return base64.b64encode(png_bytes).decode("utf-8")


def apply_mask_to_image(rgb_image: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """
    Apply a grayscale mask as alpha channel to RGB image.

    Args:
        rgb_image: RGB image (H, W, 3)
        mask: Grayscale mask (H, W) with values 0-255

    Returns:
        RGBA image (H, W, 4)
    """
    # Ensure mask is 2D
    if len(mask.shape) == 3:
        mask = mask[:, :, 0]

    # Ensure mask is uint8
    if mask.dtype != np.uint8:
        mask = (mask * 255).astype(np.uint8) if mask.max() <= 1 else mask.astype(np.uint8)

    # Create RGBA image
    rgba = np.zeros((rgb_image.shape[0], rgb_image.shape[1], 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb_image
    rgba[:, :, 3] = mask

    return rgba
