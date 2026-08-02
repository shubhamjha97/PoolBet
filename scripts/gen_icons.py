#!/usr/bin/env python3
"""Generate PoolBet PWA app icons.

Brand mark: a rounded square filled with a vertical gradient from
neon green #00FF9C (top) to neon magenta #FF2E7E (bottom), centered
on a pure-black (#000000) opaque canvas.

Run:  ./.venv/bin/python scripts/gen_icons.py
Output: web/icons/*.png
"""

import os

from PIL import Image, ImageDraw

# --- Theme -----------------------------------------------------------------
BLACK = (0, 0, 0, 255)
GREEN = (0, 255, 156)   # #00FF9C  (top)
MAGENTA = (255, 46, 126)  # #FF2E7E  (bottom)

# Supersampling factor for crisp anti-aliased corners.
SS = 4

# web/icons relative to this script (scripts/ -> ../web/icons)
OUT_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "web", "icons")
)


def _lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def _rounded_mask(size, radius):
    """Return an L-mode rounded-rectangle mask of the given size."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return mask


def make_mark(size):
    """Build the rounded-square vertical-gradient brand mark (RGBA)."""
    hi = size * SS

    # Vertical gradient (green top -> magenta bottom).
    grad = Image.new("RGB", (hi, hi))
    px = grad.load()
    for y in range(hi):
        t = y / (hi - 1)
        color = _lerp(GREEN, MAGENTA, t)
        for x in range(hi):
            px[x, y] = color

    # Subtle diagonal sheen: brighten toward top-left for a minimal lift.
    sheen = Image.new("L", (hi, hi), 0)
    spx = sheen.load()
    for y in range(hi):
        for x in range(hi):
            d = 1.0 - ((x + y) / (2.0 * (hi - 1)))  # 1 at top-left, 0 bottom-right
            spx[x, y] = int(max(0.0, d) * 38)  # up to ~15% white overlay
    grad = Image.composite(Image.new("RGB", (hi, hi), (255, 255, 255)), grad, sheen)

    # Rounded-corner alpha mask, radius ~24% of mark size.
    radius = int(hi * 0.24)
    mask = _rounded_mask(hi, radius)

    mark = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    mark.paste(grad, (0, 0), mask)

    # Downsample for anti-aliasing.
    return mark.resize((size, size), Image.LANCZOS)


def make_icon(canvas_size, mark_fraction, out_name):
    """Compose the mark centered on an opaque black canvas and save."""
    canvas = Image.new("RGBA", (canvas_size, canvas_size), BLACK)
    mark_size = max(1, round(canvas_size * mark_fraction))
    mark = make_mark(mark_size)
    offset = (canvas_size - mark_size) // 2
    canvas.alpha_composite(mark, (offset, offset))

    out = canvas.convert("RGB")  # opaque, no alpha channel
    path = os.path.join(OUT_DIR, out_name)
    out.save(path, "PNG")
    print(f"  {out_name:26s} {canvas_size}x{canvas_size}  mark~{int(mark_fraction*100)}%")
    return path


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    print(f"Generating icons into {OUT_DIR}")
    make_icon(180, 0.64, "apple-touch-icon.png")
    make_icon(192, 0.66, "icon-192.png")
    make_icon(512, 0.66, "icon-512.png")
    make_icon(512, 0.48, "icon-512-maskable.png")
    print("Done.")


if __name__ == "__main__":
    main()
