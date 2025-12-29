"""
Generate PNG icons from scratch using Pillow.
Run this script to create the extension icons.

Usage:
    pip install Pillow
    python generate_icons.py
"""
from PIL import Image, ImageDraw, ImageFont


def create_icon(size: int) -> Image.Image:
    """Create a simple icon with the letter 'A' on a blue background."""
    # Create image with blue background
    img = Image.new("RGBA", (size, size), (59, 130, 246, 255))
    draw = ImageDraw.Draw(img)

    # Draw rounded rectangle effect (corners)
    radius = size // 8

    # Try to use a font, fall back to default
    font_size = int(size * 0.6)
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except (OSError, IOError):
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except (OSError, IOError):
            font = ImageFont.load_default()

    # Draw the letter "A" centered
    text = "A"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1]  # Adjust for baseline

    draw.text((x, y), text, fill="white", font=font)

    return img


def main():
    sizes = [16, 48, 128]

    for size in sizes:
        icon = create_icon(size)
        filename = f"icon{size}.png"
        icon.save(filename)
        print(f"Created {filename}")

    print("Done! Icons created successfully.")


if __name__ == "__main__":
    main()
