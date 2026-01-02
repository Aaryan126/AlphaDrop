"""
Generate PNG icons from scratch using Pillow.
Run this script to create the extension icons with the alpha (α) symbol.

Usage:
    pip install Pillow
    python generate_icons.py
"""
from PIL import Image, ImageDraw, ImageFont


def create_rounded_rectangle(size: int, radius: int, color: tuple) -> Image.Image:
    """Create an image with a rounded rectangle."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=color)
    return img


def create_icon(size: int) -> Image.Image:
    """Create an icon with the alpha (α) symbol on a blue background."""
    # Apple blue color
    blue = (0, 113, 227, 255)

    # Create rounded rectangle background
    radius = max(2, size // 6)
    img = create_rounded_rectangle(size, radius, blue)
    draw = ImageDraw.Draw(img)

    # Try to use a serif font for the alpha symbol
    font_size = int(size * 0.7)
    font = None

    # Try different fonts
    font_names = [
        "times.ttf",
        "timesi.ttf",  # Times Italic
        "Times New Roman.ttf",
        "georgia.ttf",
        "georgiai.ttf",  # Georgia Italic
        "C:/Windows/Fonts/times.ttf",
        "C:/Windows/Fonts/timesi.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/System/Library/Fonts/Times.ttc",
    ]

    for font_name in font_names:
        try:
            font = ImageFont.truetype(font_name, font_size)
            break
        except (OSError, IOError):
            continue

    if font is None:
        font = ImageFont.load_default()

    # Draw the alpha symbol centered
    text = "α"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1] + (size * 0.05)  # Slight vertical adjustment

    draw.text((x, y), text, fill="white", font=font)

    return img


def main():
    sizes = [16, 48, 128]

    for size in sizes:
        icon = create_icon(size)
        filename = f"icon{size}.png"
        icon.save(filename)
        print(f"Created {filename}")

    print("Done! Alpha icons created successfully.")


if __name__ == "__main__":
    main()
