"""Visualize the flood-fill mask + hex-classification overlay to diagnose leaks."""
from __future__ import annotations
import math
import sys
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

# Import calibration from sibling script
sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_hex_grid as ehg


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    img_path = root / "public" / "dolmenwood-map.png"
    img = Image.open(img_path).convert("L")
    arr = np.asarray(img, dtype=np.uint8)

    # Try a few thresholds and dilate counts
    for thr, dil in [(60, 2), (80, 2), (100, 2), (120, 2), (80, 4), (100, 4), (120, 4), (140, 4)]:
        try:
            visited = ehg.build_outside_mask(arr, threshold=thr, dilate_iters=dil)
        except RuntimeError as e:
            print(f"thr={thr} dil={dil}: {e}")
            continue
        frac = visited.mean()
        # Sample a known-inside-woods point (center of map should be woods)
        h, w = arr.shape
        cy, cx = h // 2, w // 2
        center_outside = visited[cy, cx]
        print(f"thr={thr:3d} dil={dil}: outside_frac={frac*100:.1f}%  center_classified_outside={center_outside}")

    # Pick a good combo and render a visualization with hex centers colored.
    chosen_thr, chosen_dil = 120, 4
    visited = ehg.build_outside_mask(arr, threshold=chosen_thr, dilate_iters=chosen_dil)
    print(f"\nChose thr={chosen_thr} dil={chosen_dil}, outside_frac={visited.mean()*100:.1f}%")

    # Render: original + green dot for "open" hex centers, red dot for "woods" hex centers
    vis = Image.open(img_path).convert("RGB")
    draw = ImageDraw.Draw(vis)
    counts = {"woods": 0, "open": 0}
    for col in range(1, 21):
        for row in range(1, 14):
            cx, cy = ehg.hex_center(col, row)
            if cx < 50 or cx > vis.width - 50 or cy < 50 or cy > vis.height - 50:
                continue
            t = ehg.classify_hex(visited, cx, cy)
            if t == "open":
                draw.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), outline=(0, 220, 0), width=3)
                counts["open"] += 1
            elif t == "woods":
                draw.ellipse((cx - 12, cy - 12, cx + 12, cy + 12), outline=(220, 0, 0), width=3)
                counts["woods"] += 1
    print(f"Counts: {counts}")
    vis.thumbnail((1800, 1800))
    vis.save("/tmp/map_inspect/classification.png")
    # Also save the mask itself for inspection
    mask_img = Image.fromarray((visited * 255).astype(np.uint8))
    mask_img.thumbnail((1800, 1800))
    mask_img.save("/tmp/map_inspect/mask.png")
    print("Wrote /tmp/map_inspect/classification.png and /tmp/map_inspect/mask.png")


if __name__ == "__main__":
    main()
