"""Detect which hexes are drawn on the printed map (scripts/dolmenwood-map.png)
by finding their 4-digit coordinate labels. A hex without a label belongs to
one of the decorated regions (compass rose, "Dolmenwood" title) and is
excluded. extract_hex_grid.py uses this module (and its calibration
constants) to decide which hexes go into src/lib/hex-grid.json.

Algorithm:
  1. Threshold dark pixels (grey < 100; the labels are black text).
  2. Connected components: keep digit-sized blobs (5-30 x 12-40 px,
     20-400 px of ink).
  3. Cluster blobs into labels by proximity (within 15 px vertically and
     40 px horizontally); keep clusters of exactly four digits.
  4. Map each label to the hex whose expected label position is nearest
     (within 100 px).
  5. Gap-fill: a hex whose label was hidden by forest texture is kept if at
     least 4 of its 6 neighbours are kept (repeated until nothing changes).
  6. Add EXTRA_DRAWN_HEXES, printed hexes that steps 1-5 miss.

Requires Python 3.10+ with numpy and Pillow. Run from the repo root:
    python3 scripts/detect_drawn_hexes.py
It prints the kept hexes and writes an overlay (green = kept, red =
excluded) to <system temp dir>/dolmenwood_hex_map_debug/detected_hexes.png.
The full-image scan is slow (around 20 seconds).
"""
from __future__ import annotations
import math
import tempfile
from collections import deque
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

MAP_IMAGE = Path(__file__).resolve().parent / "dolmenwood-map.png"

# --- Calibration, measured by hand from the printed labels ---
# Flat-top hexes, numbered column then row (XXYY). Even printed columns sit
# half a row lower (odd-q offset in 0-indexed terms).
LABEL_X_COL1 = 447       # x of the label (and centre) of every column-01 hex
LABEL_Y_ROW1_ODD = 167   # y of hex 0101's label
COL_PITCH = 232.5        # px between neighbouring columns
ROW_PITCH = 268.0        # px between rows of one column
LABEL_TO_CENTER_DY = 90  # a hex's centre is this far below its label
HEX_SIZE = ROW_PITCH / math.sqrt(3)  # nominal centre-to-vertex distance, ~154.73
# The grid isn't quite regular (1.5 * HEX_SIZE = 232.09 < COL_PITCH), so
# vertices use one scale per axis, matching src/lib/hex.ts.
SCALE_X = COL_PITCH / 1.5
SCALE_Y = ROW_PITCH / math.sqrt(3)

# Printed hexes the label detector misses. 0111's label overlaps the wood's
# outline, so its digits merge with the outline's ink and no 4-digit cluster
# is found; it has only 3 kept neighbours, so gap-fill doesn't rescue it.
EXTRA_DRAWN_HEXES: frozenset[tuple[int, int]] = frozenset({(1, 11)})


def hex_center(col: int, row: int) -> tuple[float, float]:
    ci, ri = col - 1, row - 1
    x = LABEL_X_COL1 + ci * COL_PITCH
    y = LABEL_Y_ROW1_ODD + ri * ROW_PITCH + (ROW_PITCH / 2 if ci % 2 == 1 else 0)
    return x, y + LABEL_TO_CENTER_DY


def expected_label_center(col: int, row: int) -> tuple[float, float]:
    """The label centroid sits LABEL_TO_CENTER_DY above the hex center."""
    cx, cy = hex_center(col, row)
    return cx, cy - LABEL_TO_CENTER_DY


def hex_vertices(col: int, row: int) -> list[tuple[float, float]]:
    cx, cy = hex_center(col, row)
    return [
        (cx + SCALE_X * math.cos(math.radians(60 * i)),
         cy + SCALE_Y * math.sin(math.radians(60 * i)))
        for i in range(6)
    ]


def find_digit_clusters(arr: np.ndarray) -> list[tuple[int, int]]:
    """Connected-components on dark pixels; filter to digit-sized blobs;
    cluster horizontally into 4-character labels; return cluster centroids."""
    h, w = arr.shape
    mask = arr < 100
    visited = np.zeros_like(mask, dtype=bool)
    digits: list[tuple[int, int]] = []  # (cx, cy) per digit blob

    for y in range(h):
        for x in range(w):
            if not mask[y, x] or visited[y, x]:
                continue
            stack = deque([(y, x)])
            min_x = max_x = x
            min_y = max_y = y
            size = 0
            while stack:
                cy, cx = stack.pop()
                if cy < 0 or cy >= h or cx < 0 or cx >= w:
                    continue
                if visited[cy, cx] or not mask[cy, cx]:
                    continue
                visited[cy, cx] = True
                size += 1
                if cx < min_x: min_x = cx
                if cx > max_x: max_x = cx
                if cy < min_y: min_y = cy
                if cy > max_y: max_y = cy
                stack.append((cy + 1, cx))
                stack.append((cy - 1, cx))
                stack.append((cy, cx + 1))
                stack.append((cy, cx - 1))
            cw = max_x - min_x + 1
            ch = max_y - min_y + 1
            if 5 <= cw <= 30 and 12 <= ch <= 40 and 20 <= size <= 400:
                digits.append(((min_x + max_x) // 2, (min_y + max_y) // 2))

    # Group digits into labels with proximity-based connected components,
    # not by sort + sequential scan. The previous sort-then-scan version
    # could split a 4-digit label whose centroids didn't sort in left-to-
    # right order (e.g. character bounding boxes vary in y by ±1px from
    # ascenders/descenders). Y_TOL / X_GAP are empirical for the printed
    # label font; bump if the source map's font ever changes.
    Y_TOL = 15
    X_GAP = 40
    n = len(digits)
    visited = [False] * n
    clusters: list[list[tuple[int, int]]] = []
    for i in range(n):
        if visited[i]:
            continue
        # BFS frontier from digit i, joining anything within (Y_TOL, X_GAP).
        stack = [i]
        cluster: list[tuple[int, int]] = []
        while stack:
            j = stack.pop()
            if visited[j]:
                continue
            visited[j] = True
            cluster.append(digits[j])
            jx, jy = digits[j]
            for k in range(n):
                if visited[k]:
                    continue
                kx, ky = digits[k]
                if abs(ky - jy) <= Y_TOL and abs(kx - jx) <= X_GAP:
                    stack.append(k)
        # Sort the cluster left-to-right so 4-digit ordering is reproducible
        cluster.sort(key=lambda p: p[0])
        clusters.append(cluster)

    centroids: list[tuple[int, int]] = []
    for cluster in clusters:
        if len(cluster) != 4:
            continue
        xs = [p[0] for p in cluster]
        ys = [p[1] for p in cluster]
        centroids.append(((min(xs) + max(xs)) // 2, (min(ys) + max(ys)) // 2))
    return centroids


def hex_neighbors(c: int, r: int) -> list[tuple[int, int]]:
    """Six neighbours of hex (col, row) in our flat-top odd-q offset layout.
    1-indexed columns: odd col (0-indexed q is even) is NOT shifted; even col
    (0-indexed q is odd) is shifted DOWN by half a row pitch."""
    q = c - 1
    if q % 2 == 0:
        offsets = [(+1, -1), (+1, 0), (0, +1), (-1, 0), (-1, -1), (0, -1)]
    else:
        offsets = [(+1, 0), (+1, +1), (0, +1), (-1, +1), (-1, 0), (0, -1)]
    return [(c + dq, r + dr) for dq, dr in offsets]


def candidate_hexes(img_width: int, img_height: int) -> list[tuple[int, int, float, float]]:
    """All (col, row, label_cx, label_cy) tuples whose expected label centre
    sits comfortably inside the image bounds."""
    max_cols = int((img_width - LABEL_X_COL1) / COL_PITCH) + 2
    max_rows = int((img_height - LABEL_Y_ROW1_ODD - LABEL_TO_CENTER_DY) / ROW_PITCH) + 2
    out: list[tuple[int, int, float, float]] = []
    for col in range(1, max_cols + 1):
        for row in range(1, max_rows + 1):
            lx, ly = expected_label_center(col, row)
            if lx < 80 or lx > img_width - 80 or ly < 80 or ly > img_height - 80:
                continue
            out.append((col, row, lx, ly))
    return out


def detect_drawn_hexes(
    arr: np.ndarray,
    *,
    proximity_px: float = 100.0,
    gap_fill_min_neighbors: int = 4,
) -> set[tuple[int, int]]:
    """Detect which hexes are drawn on the printed map. Returns the kept
    (col, row) set. Used by both `detect_drawn_hexes.main()` (for the
    diagnostic visualization) and `extract_hex_grid.main()` (to gate the
    terrain classifier)."""
    h, w = arr.shape
    centroids = find_digit_clusters(arr)
    candidates = candidate_hexes(w, h)

    kept: set[tuple[int, int]] = set()
    for cx, cy in centroids:
        best: tuple[int, int] | None = None
        best_d = float('inf')
        for col, row, lx, ly in candidates:
            d = (cx - lx) ** 2 + (cy - ly) ** 2
            if d < best_d:
                best_d = d
                best = (col, row)
        if best is None:
            continue
        # Hex label spacing is ~COL_PITCH horizontally; anything within
        # `proximity_px` is plausibly the same hex. Outside that the cluster
        # is unattached to any candidate (probably a place-name label).
        if math.sqrt(best_d) > proximity_px:
            continue
        kept.add(best)

    # Gap-fill: hexes whose label was occluded by dense forest texture get
    # rescued by having ≥`gap_fill_min_neighbors` of 6 neighbors already in
    # the kept set. Iterate to convergence (usually one pass).
    expected_set = {(c, r) for c, r, _, _ in candidates}
    added = True
    while added:
        added = False
        for col, row in list(expected_set - kept):
            ns = hex_neighbors(col, row)
            if sum(1 for n in ns if n in kept) >= gap_fill_min_neighbors:
                kept.add((col, row))
                added = True
    # Added after gap-fill so they can't pull further hexes in.
    return kept | EXTRA_DRAWN_HEXES


def main() -> None:
    img_path = MAP_IMAGE
    img = Image.open(img_path).convert("L")
    arr = np.asarray(img, dtype=np.uint8)

    print("Detecting 4-digit label clusters (slow, scanning entire image)...")
    kept = detect_drawn_hexes(arr)
    h, w = arr.shape
    expected = candidate_hexes(w, h)
    print(f"Detected {len(kept)} drawn hexes (after gap-fill).")

    drawn = sorted(kept)
    excluded = [(c, r) for c, r, _, _ in expected if (c, r) not in kept]
    print(f"\nDrawn:    {len(drawn)} hexes")
    print(f"Excluded: {len(excluded)} hexes")

    cols_present = {c for c, _ in kept}
    rows_present = {r for _, r in kept}
    print(f"Cols span: {min(cols_present)}-{max(cols_present)}")
    print(f"Rows span: {min(rows_present)}-{max(rows_present)}")

    # Visualization
    vis = Image.open(img_path).convert("RGB")
    draw = ImageDraw.Draw(vis)
    for col, row in drawn:
        verts = hex_vertices(col, row)
        draw.polygon(verts, outline=(0, 220, 0), width=4)
    for col, row in excluded:
        verts = hex_vertices(col, row)
        draw.polygon(verts, outline=(220, 0, 0), width=2)
    out_dir = Path(tempfile.gettempdir()) / "dolmenwood_hex_map_debug"
    out_dir.mkdir(parents=True, exist_ok=True)
    vis.thumbnail((2000, 2000))
    out_path = out_dir / "detected_hexes.png"
    vis.save(out_path)
    print(f"\nWrote {out_path}")
    # Also emit kept set
    print("\nKept hex coords (compact list):")
    coords_strs = sorted(f"{c:02d}{r:02d}" for c, r in kept)
    for i in range(0, len(coords_strs), 12):
        print("  " + " ".join(coords_strs[i:i + 12]))


if __name__ == "__main__":
    main()
