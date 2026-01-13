#!/usr/bin/env python3
"""Generate Android launcher icons from the Zique Fitness logo."""

from PIL import Image
import os

# Source logo
SOURCE_LOGO = "icons/logo.png"

# Android icon sizes for different densities
LAUNCHER_SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}

# Adaptive icon foreground sizes (432dp = 108dp * 4 for xxxhdpi)
# The foreground is 108dp, but the actual image needs safe area padding
FOREGROUND_SIZES = {
    "mipmap-mdpi": 108,
    "mipmap-hdpi": 162,
    "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324,
    "mipmap-xxxhdpi": 432,
}

ANDROID_RES_PATH = "android/app/src/main/res"

def generate_launcher_icon(source_img, size, output_path):
    """Generate a square launcher icon with rounded corners appearance."""
    # Create a new image with the icon
    icon = source_img.copy()
    icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(output_path, "PNG")
    print(f"  Created {output_path} ({size}x{size})")

def generate_round_icon(source_img, size, output_path):
    """Generate a round launcher icon (same as regular for now)."""
    icon = source_img.copy()
    icon = icon.resize((size, size), Image.Resampling.LANCZOS)
    icon.save(output_path, "PNG")
    print(f"  Created {output_path} ({size}x{size})")

def generate_foreground_icon(source_img, size, output_path):
    """Generate adaptive icon foreground with proper safe zone."""
    # For adaptive icons, the foreground is 108dp but the actual content
    # should be in the center 66dp (66/108 = ~61%)
    # We create a larger canvas and center the logo

    # Create transparent canvas
    foreground = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Calculate the inner safe zone (about 66% of total size)
    safe_zone_ratio = 66 / 108
    safe_size = int(size * safe_zone_ratio)

    # Resize logo to fit in safe zone
    logo_resized = source_img.copy()
    logo_resized = logo_resized.resize((safe_size, safe_size), Image.Resampling.LANCZOS)

    # Center the logo on the canvas
    offset = (size - safe_size) // 2
    foreground.paste(logo_resized, (offset, offset), logo_resized if logo_resized.mode == 'RGBA' else None)

    foreground.save(output_path, "PNG")
    print(f"  Created {output_path} ({size}x{size})")

def main():
    print("Loading source logo...")
    source = Image.open(SOURCE_LOGO)

    # Convert to RGBA if needed
    if source.mode != 'RGBA':
        source = source.convert('RGBA')

    print(f"Source logo: {source.size[0]}x{source.size[1]}")

    print("\nGenerating launcher icons...")
    for density, size in LAUNCHER_SIZES.items():
        output_dir = os.path.join(ANDROID_RES_PATH, density)
        os.makedirs(output_dir, exist_ok=True)

        # Regular launcher icon
        generate_launcher_icon(source, size, os.path.join(output_dir, "ic_launcher.png"))

        # Round launcher icon
        generate_round_icon(source, size, os.path.join(output_dir, "ic_launcher_round.png"))

    print("\nGenerating adaptive icon foregrounds...")
    for density, size in FOREGROUND_SIZES.items():
        output_dir = os.path.join(ANDROID_RES_PATH, density)
        os.makedirs(output_dir, exist_ok=True)

        generate_foreground_icon(source, size, os.path.join(output_dir, "ic_launcher_foreground.png"))

    print("\nDone! All Android launcher icons have been generated.")

if __name__ == "__main__":
    main()
