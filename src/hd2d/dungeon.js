// Random dungeon floors for the Sunken Abbey: rooms joined by two-wide corridors.
// Each floor comes from a seed, so the same seed always rebuilds the same layout.
//
// Tiles:  W wall   . floor   < stairs up   > stairs down   g sarcophagus (crypt)   r boulder (warrens)

export const MAX_DEPTH = 4; // deepest floor in this version of the game

export const FLOORS = {
    1: { theme: 'crypt',   name: 'The Crypt',      boss: null },
    2: { theme: 'crypt',   name: 'The Ossuary',    boss: 'gravewarden' },
    3: { theme: 'warrens', name: 'Goblin Warrens', boss: null },
    4: { theme: 'warrens', name: 'Chieftain\'s Den', boss: 'goblin_chieftain' },
};

// Which enemies live on each theme of floor, with relative weights
export const FLOOR_ENEMIES = {
    crypt: [['skeleton', 3], ['slime', 2]],
    warrens: [['goblin', 3], ['wolf', 2]],
};

function mulberry32(seed) {
    return () => {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const SIZE = 44;

/**
 * @returns { grid: string[], start, down, rooms, bossRoom, loreSpot, questSpot, torches }
 *   positions are { col, row }; rooms are { x, y, w, h }
 */
export function generateFloor(depth, seed) {
    const rand = mulberry32(seed);
    const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
    const g = Array.from({ length: SIZE }, () => new Array(SIZE).fill('W'));
    const carve = (c, r) => { if (c > 0 && r > 0 && c < SIZE - 1 && r < SIZE - 1) g[r][c] = '.'; };

    // Rooms: random rectangles that don't touch each other
    const rooms = [];
    for (let tries = 0; tries < 200 && rooms.length < 10; tries++) {
        const w = int(5, 9), h = int(5, 8);
        const x = int(2, SIZE - w - 3), y = int(2, SIZE - h - 3);
        if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
        rooms.push({ x, y, w, h });
    }
    for (const room of rooms) {
        for (let r = room.y; r < room.y + room.h; r++) for (let c = room.x; c < room.x + room.w; c++) carve(c, r);
    }
    const center = (room) => ({ col: room.x + Math.floor(room.w / 2), row: room.y + Math.floor(room.h / 2) });

    // Corridors: chain rooms left to right, plus a couple of extra links so it isn't one long line
    const corridor = (a, b) => {
        const p = center(a), q = center(b);
        const horizontalFirst = rand() < 0.5;
        const [mid] = horizontalFirst ? [{ col: q.col, row: p.row }] : [{ col: p.col, row: q.row }];
        for (const [from, to] of [[p, mid], [mid, q]]) {
            for (let c = Math.min(from.col, to.col); c <= Math.max(from.col, to.col); c++) { carve(c, from.row); carve(c, from.row + 1); }
            for (let r = Math.min(from.row, to.row); r <= Math.max(from.row, to.row); r++) { carve(from.col, r); carve(from.col + 1, r); }
        }
    };
    const ordered = [...rooms].sort((a, b) => center(a).col - center(b).col);
    for (let i = 1; i < ordered.length; i++) corridor(ordered[i - 1], ordered[i]);
    for (let i = 0; i < 2; i++) corridor(ordered[int(0, ordered.length - 1)], ordered[int(0, ordered.length - 1)]);

    // Stairs up in the first room; stairs down (and the boss) in the room farthest away on foot
    const startRoom = ordered[0];
    const up = center(startRoom);
    const dist = bfs(g, up);
    const farthest = [...rooms].sort((a, b) => (dist[center(b).row][center(b).col] ?? -1) - (dist[center(a).row][center(a).col] ?? -1))[0];
    const others = rooms.filter(r => r !== startRoom && r !== farthest);

    g[up.row][up.col] = '<';
    let down = null;
    if (depth < MAX_DEPTH) {
        down = center(farthest);
        // Keep the stairs at the back of the room so the boss stands between you and them
        down.row = farthest.y + 1;
        g[down.row][down.col] = '>';
    }

    // Set dressing that doubles as cover: sarcophagi in the crypt, boulders in the warrens
    const prop = FLOORS[depth].theme === 'crypt' ? 'g' : 'r';
    for (const room of others) {
        for (let i = 0; i < int(0, 3); i++) {
            const c = int(room.x + 1, room.x + room.w - 2), r = int(room.y + 1, room.y + room.h - 2);
            // Never block a doorway: only place a prop whose 4 neighbours are all open floor
            if ([[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]].every(([dc, dr]) => g[r + dr][c + dc] === '.')) g[r][c] = prop;
        }
    }

    const pickSpot = (room) => {
        for (let i = 0; i < 30; i++) {
            const c = int(room.x + 1, room.x + room.w - 2), r = int(room.y + 1, room.y + room.h - 2);
            if (g[r][c] === '.') return { col: c, row: r };
        }
        return center(room);
    };
    const loreRoom = others.length ? others[int(0, others.length - 1)] : farthest;
    const questRoom = others.length > 1 ? others.find(r => r !== loreRoom) : farthest;

    // Wall torches: wall tiles whose south side is floor (they face the camera)
    const torches = [];
    for (let r = 1; r < SIZE - 1; r++) {
        for (let c = 1; c < SIZE - 1; c++) {
            if (g[r][c] === 'W' && g[r + 1][c] === '.' && (c + r * 3) % 7 === 0) torches.push({ col: c, row: r });
        }
    }

    return {
        grid: g.map(row => row.join('')),
        start: { col: up.col, row: up.row + 1 },
        down,
        rooms,
        startRoom,
        bossRoom: farthest,
        loreSpot: pickSpot(loreRoom),
        questSpot: pickSpot(questRoom),
        torches,
    };
}

function bfs(g, from) {
    const dist = g.map(row => row.map(() => undefined));
    dist[from.row][from.col] = 0;
    const q = [from];
    while (q.length) {
        const { col, row } = q.shift();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const c = col + dc, r = row + dr;
            if (g[r]?.[c] === undefined || g[r][c] === 'W' || dist[r][c] !== undefined) continue;
            dist[r][c] = dist[row][col] + 1;
            q.push({ col: c, row: r });
        }
    }
    return dist;
}
