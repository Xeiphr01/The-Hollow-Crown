import * as THREE from 'three';

// Pixel-art textures drawn in code, so the prototype needs no new art files.
// Swap any of these for a real PNG later (TextureLoader + the same filter settings).

// Seeded RNG so textures look identical on every load
function rng(seed) {
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

function makeTexture(w, h, seed, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const g = canvas.getContext('2d');
    paint(g, w, h, rng(seed));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;            // crisp pixels up close
    tex.minFilter = THREE.NearestMipmapLinearFilter; // no shimmer far away
    return tex;
}

function speckle(g, w, h, r, base, colors, density) {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (r() < density) {
                g.fillStyle = colors[Math.floor(r() * colors.length)];
                g.fillRect(x, y, 1, 1);
            }
        }
    }
}

export const grassTop = () => makeTexture(16, 16, 3, (g, w, h, r) =>
    speckle(g, w, h, r, '#4fae4f', ['#46a046', '#5dbd5a', '#3f913f', '#68c463'], 0.35));

export const pathTop = () => makeTexture(16, 16, 7, (g, w, h, r) =>
    speckle(g, w, h, r, '#dcc391', ['#cfb47f', '#e6cf9f', '#c5a973'], 0.3));

export const dirt = () => makeTexture(16, 16, 11, (g, w, h, r) =>
    speckle(g, w, h, r, '#6b4f36', ['#5d432d', '#7a5c40'], 0.4));

// Stone cliff face with a grass lip on top. Height in pixels matches the block height
// (16px per world unit) so pixels stay square.
export const stoneSide = (h) => makeTexture(16, h, 5 + h, (g, w, hh, r) => {
    g.fillStyle = '#7a7e8a'; // mortar
    g.fillRect(0, 0, w, hh);
    const brickH = 4;
    for (let row = 0, y = 2; y < hh; row++, y += brickH) {
        let x = row % 2 ? -3 : 0;
        while (x < w) {
            const bw = 5 + Math.floor(r() * 3);
            const shade = 150 + Math.floor(r() * 30);
            g.fillStyle = `rgb(${shade - 6}, ${shade - 3}, ${shade + 8})`;
            g.fillRect(x + 1, y + 1, bw - 1, brickH - 1);
            g.fillStyle = `rgb(${shade + 18}, ${shade + 20}, ${shade + 28})`; // top highlight
            g.fillRect(x + 1, y + 1, bw - 1, 1);
            x += bw;
        }
    }
    g.fillStyle = '#3e8a3e'; g.fillRect(0, 0, w, 2); // grass overhang
    g.fillStyle = '#2b6a2b'; g.fillRect(0, 2, w, 1);
});

// Tall grass blades on a transparent background; `flowers` adds coloured tips
export const grassBlades = (flowers) => makeTexture(16, 16, flowers ? 21 : 13, (g, w, h, r) => {
    const greens = ['#7ccf5a', '#5fbf4a', '#9adb6a', '#4aa83c'];
    for (let i = 0; i < 7; i++) {
        const x = 1 + Math.floor(r() * 14);
        const top = 3 + Math.floor(r() * 8);
        g.fillStyle = greens[i % greens.length];
        g.fillRect(x, top, 1, h - top);
        if (r() < 0.5) g.fillRect(x + (r() < 0.5 ? -1 : 1), top + 2, 1, h - top - 2);
        if (flowers && i % 2 === 0) {
            g.fillStyle = ['#f48fb1', '#ffffff', '#b39ddb', '#ffe082'][Math.floor(r() * 4)];
            g.fillRect(x, top - 1, 1, 2);
        }
    }
});

// --- Dungeon ----------------------------------------------------------------------
// Worn flagstones: a 2x2 grid of slabs with dark grout
export const flagstone = (tint = [120, 122, 130]) => makeTexture(16, 16, 17 + tint[0], (g, w, h, r) => {
    g.fillStyle = '#2a2a30';
    g.fillRect(0, 0, w, h);
    for (const [x, y] of [[0, 0], [8, 0], [0, 8], [8, 8]]) {
        const v = Math.floor(r() * 18) - 9;
        g.fillStyle = `rgb(${tint[0] + v}, ${tint[1] + v}, ${tint[2] + v})`;
        g.fillRect(x + 1, y + 1, 7, 7);
        g.fillStyle = `rgba(0, 0, 0, 0.18)`;
        for (let i = 0; i < 4; i++) g.fillRect(x + 1 + Math.floor(r() * 7), y + 1 + Math.floor(r() * 7), 1, 1);
    }
});

// Brick wall face; `rows` of bricks per texture so tall walls keep square pixels
export const dungeonBrick = (tint = [96, 98, 110], h = 16) => makeTexture(16, h, 23 + tint[1] + h, (g, w, hh, r) => {
    g.fillStyle = '#1e1e24';
    g.fillRect(0, 0, w, hh);
    for (let row = 0, y = 0; y < hh; row++, y += 4) {
        for (let x = row % 2 ? -4 : 0; x < w; x += 8) {
            const v = Math.floor(r() * 22) - 11;
            g.fillStyle = `rgb(${tint[0] + v}, ${tint[1] + v}, ${tint[2] + v})`;
            g.fillRect(x + 1, y + 1, 7, 3);
        }
    }
});

// Packed earth with pebbles (goblin warrens)
export const earth = () => makeTexture(16, 16, 29, (g, w, h, r) =>
    speckle(g, w, h, r, '#5a4632', ['#4d3b29', '#665039', '#7a6a55', '#3f3122'], 0.4));
