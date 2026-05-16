"""Extract the Dolmenwood hex grid from public/dolmenwood-map.png.

Outputs src/lib/hex-grid.json with the canonical hex manifest:
  {
    "meta": { "imageWidth", "imageHeight", "cols", "rows", "labelOrigin", "colPitch", "rowPitch", "hexSize" },
    "hexes": { "0101": { "col": 1, "row": 1, "terrain": "woods" | "open" }, ... }
  }

Approach:
  1. Calibration (hardcoded from scripts/find_labels.py + zoom_one.py):
       - Flat-top hexes
       - Column-major XXYY numbering
       - Even columns offset DOWN by half a row pitch
       - col_pitch = 232.5 px, row_pitch = 268.0 px
       - Label centroid of (col=1, row=1) at pixel (447, 167)
       - Hex center sits 90 px below the label centroid (label is in upper part of hex)
       - Hex size (center-to-vertex) = 154.74 px (= row_pitch / sqrt(3))

  2. Terrain classification by flood-fill:
       - Threshold image to a binary mask of "dark" pixels (the dolmenwood boundary
         line is thick and very dark; hex grid lines are lighter and thinner).
       - Use threshold ~80 so that the boundary is kept and hex grid lines are not.
       - Dilate slightly to close small gaps in the boundary.
       - Flood-fill from (10, 10) — definitely outside the woods — through "light" pixels.
       - For each hex center, look at a 3x3 neighborhood: if the majority of pixels were
         reached by the flood (light/outside), classify as "open"; otherwise "woods".
"""
from __future__ import annotations

import json
import math
import sys
from collections import deque
from pathlib import Path

from PIL import Image
import numpy as np


# --- Calibration ---
LABEL_X_COL1 = 447      # x of label centroid for column 01 (odd)
LABEL_Y_ROW1_ODD = 167  # y of label centroid for (col=1, row=1)
COL_PITCH = 232.5       # px between adjacent columns horizontally
ROW_PITCH = 268.0       # px between adjacent same-column rows vertically
LABEL_TO_CENTER_DY = 90 # px hex center is below the label centroid
HEX_SIZE = ROW_PITCH / math.sqrt(3)  # center-to-vertex distance, ~154.74


def hex_center(col: int, row: int) -> tuple[float, float]:
    """Pixel coordinates of the center of hex (col, row). col/row are 1-indexed."""
    ci, ri = col - 1, row - 1
    x = LABEL_X_COL1 + ci * COL_PITCH
    y_label = LABEL_Y_ROW1_ODD + ri * ROW_PITCH + (ROW_PITCH / 2 if ci % 2 == 1 else 0)
    return x, y_label + LABEL_TO_CENTER_DY


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
    """Sample a small disk around the hex center. Majority vote on visited (outside)."""
    h, w = visited.shape
    cx_i, cy_i = int(round(cx)), int(round(cy))
    if cx_i < 0 or cx_i >= w or cy_i < 0 or cy_i >= h:
        return "edge"
    outside_count = 0
    total = 0
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            if dx * dx + dy * dy > radius * radius:
                continue
            y, x = cy_i + dy, cx_i + dx
            if 0 <= y < h and 0 <= x < w:
                total += 1
                if visited[y, x]:
                    outside_count += 1
    if total == 0:
        return "edge"
    frac = outside_count / total
    if frac >= 0.5:
        return "open"
    return "woods"


def main() -> None:
    # Import here so the calibration-only modules of detect_drawn_hexes
    # don't trigger when this is imported elsewhere.
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from detect_drawn_hexes import find_digit_clusters, expected_label_center  # type: ignore

    root = Path(__file__).resolve().parent.parent
    img_path = root / "public" / "dolmenwood-map.png"
    out_path = root / "src" / "lib" / "hex-grid.json"

    img = Image.open(img_path).convert("L")
    arr = np.asarray(img, dtype=np.uint8)
    h, w = arr.shape
    print(f"Loaded {w}x{h} grayscale.")

    # Build the outside mask (used only to classify TERRAIN for drawn hexes)
    print("Building outside-mask via flood-fill...")
    outside = build_outside_mask(arr)
    print(f"Outside pixels: {outside.sum()} ({outside.mean()*100:.1f}%)")

    # Step 1: detect which hexes are actually drawn on the printed map by
    # finding their 4-digit coordinate labels. Off-map regions (compass
    # rose, "Dolmenwood" title) have no labels and are excluded automatically.
    print("Detecting drawn hexes via label clusters...")
    centroids = find_digit_clusters(arr)
    print(f"Found {len(centroids)} 4-digit label clusters.")

    max_cols = int((w - LABEL_X_COL1) / COL_PITCH) + 2
    max_rows = int((h - LABEL_Y_ROW1_ODD - LABEL_TO_CENTER_DY) / ROW_PITCH) + 2
    candidates: list[tuple[int, int, float, float]] = []
    for col in range(1, max_cols + 1):
        for row in range(1, max_rows + 1):
            lx, ly = expected_label_center(col, row)
            if lx < 80 or lx > w - 80 or ly < 80 or ly > h - 80:
                continue
            candidates.append((col, row, lx, ly))

    drawn: set[tuple[int, int]] = set()
    for cx, cy in centroids:
        best: tuple[int, int] | None = None
        best_d = float("inf")
        for col, row, lx, ly in candidates:
            d = (cx - lx) ** 2 + (cy - ly) ** 2
            if d < best_d:
                best_d = d
                best = (col, row)
        if best is not None and math.sqrt(best_d) <= 100:
            drawn.add(best)
    print(f"Direct label matches: {len(drawn)} hexes")

    # Gap-fill: hexes whose label was occluded by dense forest texture get
    # rescued by having 4+ neighbors already in the drawn set. One pass is
    # usually enough but we iterate to convergence.
    def neighbors(c: int, r: int) -> list[tuple[int, int]]:
        q = c - 1
        if q % 2 == 0:
            offsets = [(+1, -1), (+1, 0), (0, +1), (-1, 0), (-1, -1), (0, -1)]
        else:
            offsets = [(+1, 0), (+1, +1), (0, +1), (-1, +1), (-1, 0), (0, -1)]
        return [(c + dq, r + dr) for dq, dr in offsets]

    expected_set = {(c, r) for c, r, _, _ in candidates}
    added = True
    while added:
        added = False
        for col, row in list(expected_set - drawn):
            ns = neighbors(col, row)
            if sum(1 for n in ns if n in drawn) >= 4:
                drawn.add((col, row))
                added = True
    print(f"After gap-fill: {len(drawn)} hexes")

    # Step 2: classify TERRAIN for each drawn hex.
    hexes: dict[str, dict] = {}
    counts = {"woods": 0, "open": 0, "edge": 0}
    cols_present: set[int] = set()
    rows_present: set[int] = set()
    for col, row in sorted(drawn):
        cx, cy = hex_center(col, row)
        if cx < 50 or cx > w - 50 or cy < 50 or cy > h - 50:
            continue
        terrain = classify_hex(outside, cx, cy)
        key = f"{col:02d}{row:02d}"
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
            "minCol": min(cols_present),
            "maxCol": max(cols_present),
            "minRow": min(rows_present),
            "maxRow": max(rows_present),
        },
        "hexes": hexes,
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(manifest, indent=2))
    print(f"Wrote {out_path}")


if __name__ == "__main__":
    main()
