"""Generate the overworld map: src/hd2d/map.js.

    python tools/gen_map.py

Lays out the regions (village, meadow, forest, graveyard, river, hills, east meadow), then
checks every region can be reached on foot from the start. The output is plain text, so it can
be hand-edited afterwards — but re-running this script overwrites those edits.

Tiles:  .  grass   ,  tall grass   =  path   T  tree   #  ledge   ;  ledge grass   t  ledge tree
        F  fence   ~  water   g  gravestone   c  campfire   H  house (footprint from HOUSES)
        >  stairs down into the Sunken Abbey (in front of the crypt)
"""
import math
import random
from collections import deque
from pathlib import Path

W, H = 64, 48
rng = random.Random(7)
grid = [['.'] * W for _ in range(H)]


def put(c, r, ch):
    if 0 <= c < W and 0 <= r < H:
        grid[r][c] = ch


def get(c, r):
    return grid[r][c] if 0 <= c < W and 0 <= r < H else None


def rect(c0, r0, c1, r1, ch):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            put(c, r, ch)


def blob(cx, cy, rad, ch, density=1.0, only='.'):
    for r in range(cy - rad, cy + rad + 1):
        for c in range(cx - rad, cx + rad + 1):
            if math.hypot(c - cx, r - cy) <= rad + 0.3 and get(c, r) == only and rng.random() < density:
                put(c, r, ch)


def hline(c0, c1, r, ch='='):
    for c in range(min(c0, c1), max(c0, c1) + 1):
        put(c, r, ch)


def vline(c, r0, r1, ch='='):
    for r in range(min(r0, r1), max(r0, r1) + 1):
        put(c, r, ch)


def scatter(c0, r0, c1, r1, ch, chance):
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1):
            if get(c, r) == '.' and rng.random() < chance:
                put(c, r, ch)


# --- Regions -------------------------------------------------------------------
# River down the east side, wobbling, two tiles wide
river = {}
for r in range(H):
    x = 46 + round(math.sin(r / 6) * 1.5)
    river[r] = x
    put(x, r, '~'); put(x + 1, r, '~')

# Forest (west): dense trees with grassy clearings — wolves
scatter(1, 1, 16, 46, 'T', 0.42)
for cx, cy in [(6, 8), (11, 20), (5, 30), (12, 38)]:
    blob(cx, cy, 3, '.', only='T')
    blob(cx, cy, 2, ',', 0.7)

# Graveyard (north): fenced, rows of gravestones — skeletons
rect(22, 2, 42, 12, '.')
for c in range(22, 43):
    put(c, 2, 'F'); put(c, 12, 'F')
for r in range(2, 13):
    put(22, r, 'F'); put(42, r, 'F')
for r in range(4, 11, 2):
    for c in range(24, 41, 3):
        if c not in (31, 32, 33):
            put(c, r, 'g')
for c, r in [(25, 11), (40, 3), (36, 9)]:
    put(c, r, 'T')

# Central meadow: tall grass, a pond and a couple of ledges — slimes
for cx, cy in [(24, 17), (39, 22), (27, 27), (36, 15)]:
    blob(cx, cy, 2, ',', 0.8)
blob(40, 27, 2, '~')
rect(20, 20, 23, 23, '#'); put(21, 21, ';'); put(22, 22, 't')
rect(34, 28, 37, 30, '#'); put(35, 29, ';')
scatter(18, 13, 44, 31, 'T', 0.04)

# Goblin hills (north-east, across the river): ledges around a camp
for c0, r0, c1, r1 in [(50, 3, 55, 7), (57, 8, 62, 13), (49, 21, 54, 25), (58, 20, 62, 24)]:
    rect(c0, r0, c1, r1, '#')
put(52, 5, 't'); put(60, 10, ';'); put(51, 23, 't'); put(60, 22, ';')
blob(56, 15, 3, '.', only='#')
put(56, 15, 'c')
for c in range(53, 60):
    if c != 56:
        put(c, 11, 'F')
scatter(48, 1, 62, 26, 'T', 0.06)

# East meadow (south-east): tall grass and scattered trees — boars
for cx, cy in [(53, 33), (59, 41), (51, 44), (58, 30)]:
    blob(cx, cy, 3, ',', 0.75)
scatter(48, 27, 62, 46, 'T', 0.06)

# Village (south-centre): cleared, with a plaza
rect(18, 32, 44, 46, '.')
for c in range(28, 37):
    put(c, 37, '='); put(c, 43, '=')
for r in range(37, 44):
    put(28, r, '='); put(36, r, '=')
scatter(18, 32, 44, 46, 'T', 0.03)

# Chicken pen
for c in range(17, 23):
    put(c, 34, 'F'); put(c, 38, 'F')
for r in range(34, 39):
    put(17, r, 'F'); put(22, r, 'F')
rect(18, 35, 21, 37, '.')

# --- Roads -----------------------------------------------------------------------
vline(32, 3, 37)        # village → graveyard (through the gate)
hline(2, 28, 40)        # forest → plaza
hline(36, 61, 40)       # plaza → east meadow (bridge over the river)
hline(32, 56, 18)       # meadow → goblin camp (bridge)
vline(56, 16, 18)
vline(32, 43, 46)       # south out of the plaza
put(32, 2, '=')         # graveyard gate

# --- Houses (col, row, width, depth) — the door faces south ------------------------
HOUSES = [
    ('shop',      24, 33, 4, 3),
    ('chapel',    38, 32, 4, 4),
    ('farmhouse', 18, 41, 3, 3),
    ('cottage',   24, 44, 3, 2),
    ('cottage',   38, 44, 3, 2),
    ('cottage',   41, 38, 3, 2),
    ('crypt',     30,  3, 5, 3),
]
for _, c0, r0, w, d in HOUSES:
    rect(c0, r0, c0 + w - 1, r0 + d - 1, 'H')
    # keep the doorstep clear
    for c in range(c0, c0 + w):
        if get(c, r0 + d) == 'T':
            put(c, r0 + d, '.')

# The abbey entrance: steps down in front of the crypt's door
put(32, 6, '>')

START = (32, 36)

# --- Reachability check --------------------------------------------------------------
SOLID = set('T#;tF~gcH>')
seen = {START}
q = deque([START])
while q:
    c, r = q.popleft()
    for dc, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        n = (c + dc, r + dr)
        if n not in seen and get(*n) is not None and get(*n) not in SOLID:
            seen.add(n)
            q.append(n)

checkpoints = {'graveyard': (32, 8), 'crypt steps': (32, 7), 'forest clearing': (11, 20), 'goblin camp': (56, 17),
               'east meadow': (55, 38), 'meadow': (30, 25), 'pen entrance': (20, 39)}
for name, p in checkpoints.items():
    assert p in seen, f'{name} {p} is not reachable from the start'
    print(f'ok: {name} reachable')

open_count = sum(1 for r in range(H) for c in range(W) if grid[r][c] not in SOLID)
print(f'{len(seen)} of {open_count} walkable tiles reachable')

# --- Write --------------------------------------------------------------------------
rows = '\n'.join(f"    '{''.join(row)}'," for row in grid)
houses = '\n'.join(f"    {{ type: '{t}', col: {c}, row: {r}, w: {w}, d: {d} }}," for t, c, r, w, d in HOUSES)
out = f"""// Generated by tools/gen_map.py — edit by hand or re-run the script (which overwrites edits).
//   .  grass          =  dirt path        ,  tall grass       T  tree        F  wooden fence
//   #  raised ledge   ;  ledge grass      t  ledge tree       ~  water       g  gravestone
//   c  campfire       H  house (built from HOUSES below)       >  stairs down into the abbey

export const MAP = [
{rows}
];

// Houses: top-left tile, width (x) and depth (z) in tiles. Doors face south.
export const HOUSES = [
{houses}
];

export const START = {{ col: {START[0]}, row: {START[1]} }};
"""
Path(__file__).resolve().parent.parent.joinpath('src', 'hd2d', 'map.js').write_text(out, encoding='utf-8')
print('wrote src/hd2d/map.js')
