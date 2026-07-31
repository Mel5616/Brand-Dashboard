#!/usr/bin/env python3
"""Flatten a PDF: render every page to an image and rebuild the file, so the
result has no text layer — nothing to select, copy or extract. Used for launch
decks shared externally.

Usage:  python3 scripts/flatten_pdf.py in.pdf out.pdf [dpi]
"""
import sys

import fitz  # PyMuPDF


def flatten(src: str, dst: str, dpi: int = 150) -> None:
    doc = fitz.open(src)
    out = fitz.open()
    for page in doc:
        pix = page.get_pixmap(dpi=dpi)
        new = out.new_page(width=page.rect.width, height=page.rect.height)
        # JPEG page images keep the file size sane (slides are photographic)
        new.insert_image(new.rect, stream=pix.tobytes("jpeg", jpg_quality=80))
    # garbage/deflate keeps the all-image file as small as possible
    out.save(dst, garbage=4, deflate=True)
    print(f"{len(doc)} pages flattened at {dpi}dpi → {dst}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    flatten(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 150)
