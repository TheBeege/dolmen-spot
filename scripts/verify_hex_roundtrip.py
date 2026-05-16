"""Round-trip every hex in hex-grid.json through hex_center -> pixel_to_hex.

Both functions mirror the TS implementations in src/lib/hex.ts.
"""
import json, math
from pathlib import Path

g = json.loads((Path(__file__).resolve().parent.parent / "src/lib/hex-grid.json").read_text())
meta = g["meta"]
COL_PITCH = meta["colPitch"]
ROW_PITCH = meta["rowPitch"]
HEX_SIZE = meta["hexSize"]
ORIGIN_X = meta["labelX_col1"]
ORIGIN_Y = meta["labelY_row1"] + meta["labelToCenterDy"]
SQRT3 = math.sqrt(3)


def hex_center(col, row):
    ci, ri = col - 1, row - 1
    x = ORIGIN_X + ci * COL_PITCH
    y = ORIGIN_Y + ri * ROW_PITCH + (ROW_PITCH / 2 if ci % 2 == 1 else 0)
    return x, y


def pixel_to_hex(px, py):
    """Mirror of TS pixelToHex."""
    dx = px - ORIGIN_X
    dy = py - ORIGIN_Y
    q = (2 / 3) * dx / HEX_SIZE
    r = ((-1 / 3) * dx + (SQRT3 / 3) * dy) / HEX_SIZE
    s = -q - r
    rq = round(q)
    rr = round(r)
    rs = round(s)
    qd = abs(rq - q)
    rd = abs(rr - r)
    sd = abs(rs - s)
    if qd > rd and qd > sd:
        rq = -rr - rs
    elif rd > sd:
        rr = -rq - rs
    else:
        rs = -rq - rr
    # even-q offset: even columns shifted DOWN
    # TS code uses: row = rr + ((rq - (rq & 1)) >> 1) + 1
    col = rq + 1
    row = rr + ((rq - (rq & 1)) >> 1) + 1
    return col, row


fail = 0
samples = []
for coord, cell in g["hexes"].items():
    cx, cy = hex_center(cell["col"], cell["row"])
    bc, br = pixel_to_hex(cx, cy)
    if (bc, br) != (cell["col"], cell["row"]):
        fail += 1
        if len(samples) < 12:
            samples.append((coord, cell["col"], cell["row"], cx, cy, bc, br))

for s in samples:
    print(f"FAIL {s[0]} col={s[1]} row={s[2]} center=({s[3]:.1f},{s[4]:.1f}) -> col={s[5]} row={s[6]}")
print(f"\nTotal: {len(g['hexes'])}, failures: {fail}")
