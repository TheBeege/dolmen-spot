"""Extract the Dolmenwood hex grid from the printed map, scripts/dolmenwood-map.png.

Writes src/lib/hex-grid.json:
  {
    "meta": { "imageWidth", "imageHeight", "labelX_col1", "labelY_row1",
              "colPitch", "rowPitch", "labelToCenterDy", "hexSize",
              "orientation": "flat-top", "offset": "odd-q", "cellCount" },
    "hexes": { "0101": { "col": 1, "row": 1, "terrain": "woods" | "open" }, ... }
  }
The calibration constants (label origin, pitches, label-to-centre offset)
live in detect_drawn_hexes.py and are shared with it.

Approach:
  1. Drawn hexes: detect_drawn_hexes() finds the hexes printed on the map
     (see that module).
  2. Terrain by flood fill:
       - Dark pixels (grey < 120) are walls: the thick wood outline is
         kept, while the lighter hex grid lines are not.
       - Dilate the walls 4 times (4-connected) to close small gaps.
       - Flood-fill from pixel (10, 10), outside the wood, through
         non-wall pixels.
       - A hex is "open" if at least half of a radius-8 px disk around its
         centre was reached by the flood, else "woods".
     A detected hex centred within EDGE_MARGIN px of the image's edge is
     left out (and reported); one listed in EXTRA_DRAWN_HEXES is an error.

Requires Python 3.10+ with numpy and Pillow. Run from the repo root:
    python3 scripts/extract_hex_grid.py
"""
from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image
import numpy as np

# detect_drawn_hexes lives next to this file but isn't on sys.path when run
# as `python3 scripts/extract_hex_grid.py`. Inject the scripts directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from detect_drawn_hexes import (  # noqa: E402
    COL_PITCH,
    EXTRA_DRAWN_HEXES,
    HEX_SIZE,
    LABEL_TO_CENTER_DY,
    LABEL_X_COL1,
    LABEL_Y_ROW1_ODD,
    MAP_IMAGE,
    ROW_PITCH,
    detect_drawn_hexes,
    hex_center,
)

# A hex centred closer than this to the image's edge is left out of the grid.
EDGE_MARGIN = 50


def build_outside_mask(arr: np.ndarray, threshold: int = 120, dilate_iters: int = 4) -> np.ndarray:
    """Return a boolean mask where True = pixel is outside the woods (flood-reachable from corner)."""
    h, w = arr.shape
    # Dark = below threshold. These are the boundary line pixels.
    dark = arr < threshold

    # Dilate the dark mask to close small gaps in the boundary. We do a simple
    # iterative 4-connected dilation.
    blocked = dark.copy()
    for _ in range(dilate_iters):
        nxt = blocked.copy()
        nxt[1:, :] |= blocked[:-1, :]
        nxt[:-1, :] |= blocked[1:, :]
        nxt[:, 1:] |= blocked[:, :-1]
        nxt[:, :-1] |= blocked[:, 1:]
        blocked = nxt

    # BFS flood fill from (10, 10), through pixels that are not blocked.
    visited = np.zeros_like(blocked, dtype=bool)
    start = (10, 10)
    if blocked[start]:
        raise RuntimeError(f"Starting corner {start} is blocked; pick another seed.")

    q: deque[tuple[int, int]] = deque([start])
    visited[start] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and not blocked[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    return visited


def classify_hex(visited: np.ndarray, cx: float, cy: float, radius: int = 8) -> str:
    """Majority vote over a disk around the hex centre: "open" if at least half
    of it was reached by the flood fill (outside the wood), else "woods". The
    disk must lie inside the image; main() leaves out hexes near the edge."""
    h, w = visited.shape
    cx_i, cy_i = int(round(cx)), int(round(cy))
    if not (radius <= cx_i < w - radius and radius <= cy_i < h - radius):
        raise ValueError(f"disk around ({cx_i}, {cy_i}) is not inside the {w}x{h} image")
    outside_count = 0
    total = 0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            total += 1
            if visited[cy_i + dy, cx_i + dx]:
                outside_count += 1
    return "open" if outside_count / total >= 0.5 else "woods"


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    img_path = MAP_IMAGE
    out_path = root / "src" / "lib" / "hex-grid.json"

    img = Image.open(img_path).convert("L")
    arr = np.asarray(img, dtype=np.uint8)
    h, w = arr.shape
    print(f"Loaded {w}x{h} grayscale.")

    # Build the outside mask (used only to classify TERRAIN for drawn hexes)
    print("Building outside-mask via flood-fill...")
    outside = build_outside_mask(arr)
    print(f"Outside pixels: {outside.sum()} ({outside.mean()*100:.1f}%)")

    # Step 1: detect which hexes are actually drawn on the printed map.
    # Shared with the diagnostic visualisation in detect_drawn_hexes.py so
    # both scripts agree on the set; see that module for the algorithm.
    print("Detecting drawn hexes via label clusters...")
    drawn = detect_drawn_hexes(arr)
    print(f"After gap-fill: {len(drawn)} hexes")

    # Step 2: classify TERRAIN for each drawn hex.
    hexes: dict[str, dict] = {}
    counts = {"woods": 0, "open": 0}
    cols_present: set[int] = set()
    rows_present: set[int] = set()
    for col, row in sorted(drawn):
        cx, cy = hex_center(col, row)
        key = f"{col:02d}{row:02d}"
        if cx < EDGE_MARGIN or cx > w - EDGE_MARGIN or cy < EDGE_MARGIN or cy > h - EDGE_MARGIN:
            if (col, row) in EXTRA_DRAWN_HEXES:
                raise RuntimeError(
                    f"EXTRA_DRAWN_HEXES lists {key}, but its centre ({cx:.0f}, {cy:.0f}) "
                    f"is within {EDGE_MARGIN} px of the image's edge"
                )
            print(f"Left out {key}: its centre ({cx:.0f}, {cy:.0f}) is within {EDGE_MARGIN} px of the image's edge")
            continue
        terrain = classify_hex(outside, cx, cy)
        hexes[key] = {"col": col, "row": row, "terrain": terrain}
        counts[terrain] += 1
        cols_present.add(col)
        rows_present.add(row)

    print(f"Hexes: {len(hexes)} total. Breakdown: {counts}")
    print(f"Cols present: {min(cols_present)}-{max(cols_present)}")
    print(f"Rows present: {min(rows_present)}-{max(rows_present)}")

    manifest = {
        "meta": {
            "imageWidth": w,
            "imageHeight": h,
            "labelX_col1": LABEL_X_COL1,
            "labelY_row1": LABEL_Y_ROW1_ODD,
            "colPitch": COL_PITCH,
            "rowPitch": ROW_PITCH,
            "labelToCenterDy": LABEL_TO_CENTER_DY,
            "hexSize": HEX_SIZE,
            "orientation": "flat-top",
            "offset": "odd-q",
            "cellCount": len(hexes),
        },
        "hexes": hexes,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
