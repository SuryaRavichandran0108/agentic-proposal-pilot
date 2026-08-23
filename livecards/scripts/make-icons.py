"""
Generate the PWA icons in public/ from a tiny vector description.

Kept in the repo so the icons have a reproducible source rather than being
opaque binaries. Run with: python3 scripts/make-icons.py
"""

import struct
import zlib
from pathlib import Path

SUPERSAMPLE = 2  # render large, average down — cheap anti-aliasing

INDIGO = (79, 70, 229)
WHITE = (255, 255, 255)


def rounded_rect_contains(x, y, left, top, right, bottom, radius):
    if not (left <= x < right and top <= y < bottom):
        return False
    for cx, cy in (
        (left + radius, top + radius),
        (right - radius, top + radius),
        (left + radius, bottom - radius),
        (right - radius, bottom - radius),
    ):
        # Only the corner quadrants need the distance test.
        if (x < left + radius or x > right - radius) and (
            y < top + radius or y > bottom - radius
        ):
            if (x - cx) ** 2 + (y - cy) ** 2 > radius**2:
                # Might still be inside a different corner's quadrant.
                continue
            return True
    if (x < left + radius or x > right - radius) and (
        y < top + radius or y > bottom - radius
    ):
        return False
    return True


def blend(base, top, alpha):
    return tuple(round(b + (t - b) * alpha) for b, t in zip(base, top))


def render(size):
    big = size * SUPERSAMPLE
    scale = big / 512.0

    def s(v):
        return v * scale

    pixels = [[INDIGO for _ in range(big)] for _ in range(big)]

    # Back card, translucent; front card, solid. Same shapes as favicon.svg.
    cards = [
        (s(104), s(140), s(328), s(300), s(34), 0.55),
        (s(184), s(212), s(408), s(372), s(34), 1.0),
    ]

    for left, top, right, bottom, radius, alpha in cards:
        for y in range(int(top), min(int(bottom) + 1, big)):
            for x in range(int(left), min(int(right) + 1, big)):
                if rounded_rect_contains(x, y, left, top, right, bottom, radius):
                    pixels[y][x] = blend(pixels[y][x], WHITE, alpha)

    # Downsample by averaging each SUPERSAMPLE x SUPERSAMPLE block.
    out = bytearray()
    n = SUPERSAMPLE * SUPERSAMPLE
    for y in range(size):
        out.append(0)  # PNG filter type 0 for this scanline
        for x in range(size):
            r = g = b = 0
            for dy in range(SUPERSAMPLE):
                row = pixels[y * SUPERSAMPLE + dy]
                for dx in range(SUPERSAMPLE):
                    pr, pg, pb = row[x * SUPERSAMPLE + dx]
                    r += pr
                    g += pg
                    b += pb
            out += bytes((r // n, g // n, b // n))
    return bytes(out)


def write_png(path, size, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(
            ">I", zlib.crc32(body) & 0xFFFFFFFF
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)  # 8-bit RGB
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    Path(path).write_bytes(png)
    print(f"wrote {path} ({size}x{size}, {len(png)} bytes)")


for size in (192, 512):
    write_png(f"public/icon-{size}.png", size, render(size))
