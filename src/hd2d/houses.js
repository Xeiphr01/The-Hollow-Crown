import * as THREE from 'three';

// Houses built from simple shapes: plastered timber-frame walls, a gabled roof, a door,
// warm-lit windows (the bloom pass makes them glow) and a chimney. All textures are drawn in code.

function canvasTexture(w, h, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    paint(canvas.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

// One tile of wall: cream plaster inside a dark timber frame
const plaster = () => canvasTexture(16, 16, (g) => {
    g.fillStyle = '#e8dcc0'; g.fillRect(0, 0, 16, 16);
    g.fillStyle = '#d9cba9';
    for (let i = 0; i < 18; i++) g.fillRect((i * 7) % 16, (i * 11) % 16, 1, 1);
    g.fillStyle = '#5a3d26';
    g.fillRect(0, 0, 16, 2); g.fillRect(0, 0, 2, 16);
});

const stoneWall = () => canvasTexture(16, 16, (g) => {
    g.fillStyle = '#7d8088'; g.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 4; row++) {
        for (let x = row % 2 ? -4 : 0; x < 16; x += 8) {
            g.fillStyle = ['#b9bcc4', '#aeb1ba', '#c3c6cd'][(row + x) % 3 < 0 ? 0 : (row + x) % 3];
            g.fillRect(x + 1, row * 4 + 1, 7, 3);
        }
    }
});

// Overlapping shingle rows in the given colour
const shingles = (base, dark) => canvasTexture(16, 16, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, 16, 16);
    g.fillStyle = dark;
    for (let row = 0; row < 4; row++) {
        g.fillRect(0, row * 4 + 3, 16, 1);
        for (let x = row % 2 ? 2 : 0; x < 16; x += 4) g.fillRect(x, row * 4, 1, 3);
    }
});

const STYLES = {
    cottage:   { wallH: 1.3, roofH: 0.9, wall: plaster, roof: ['#b5543c', '#7e3627'], chimney: true },
    farmhouse: { wallH: 1.3, roofH: 1.0, wall: plaster, roof: ['#b08a4a', '#7a5d2e'], chimney: true },
    shop:      { wallH: 1.5, roofH: 0.9, wall: plaster, roof: ['#3f7d6a', '#2a5649'], sign: 'GOODS' },
    chapel:    { wallH: 1.9, roofH: 1.2, wall: stoneWall, roof: ['#5a6475', '#3c4350'], tower: true },
    crypt:     { wallH: 1.4, roofH: 0.6, wall: stoneWall, roof: ['#3d4049', '#26282e'], dark: true },
};
const COTTAGE_ROOFS = [['#b5543c', '#7e3627'], ['#4f7fa8', '#355a78'], ['#8a5a9e', '#5f3d6d']];

const wood = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1 });
const windowGlow = new THREE.MeshStandardMaterial({ color: '#ffd98a', emissive: '#ffb347', emissiveIntensity: 1.6 });
const voidMat = new THREE.MeshBasicMaterial({ color: '#050507' });
const chimneyMat = new THREE.MeshStandardMaterial({ color: '#8a6e5a', roughness: 1, flatShading: true });

// A wall material whose texture repeats once per world unit on a face `width` wide
function wallMaterial(makeTex, width, height) {
    const tex = makeTex();
    tex.repeat.set(width, height);
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
}

// Triangular roof prism with its ridge along x, sitting on top of the walls
function roofGeometry(width, depth, height) {
    const shape = new THREE.Shape([
        new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, height),
    ]);
    return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false })
        .rotateY(Math.PI / 2)
        .translate(-width / 2, 0, 0);
}

function signTexture(text) {
    const tex = canvasTexture(64, 16, (g) => {
        g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, 64, 16);
        g.fillStyle = '#3d2a17'; g.fillRect(0, 0, 64, 1); g.fillRect(0, 15, 64, 1);
        g.fillStyle = '#ffd700'; g.font = 'bold 11px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, 32, 8.5);
    });
    tex.magFilter = THREE.LinearFilter;
    return tex;
}

function buildHouse(house, center, index) {
    const style = STYLES[house.type];
    const group = new THREE.Group();
    const w = house.w - 0.15, d = house.d - 0.15;
    const { wallH, roofH } = style;
    const add = (mesh) => { mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh; };

    // Walls: front/back faces repeat across the width, side faces across the depth
    const front = wallMaterial(style.wall, w, wallH);
    const side = wallMaterial(style.wall, d, wallH);
    add(new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d).translate(0, wallH / 2, 0), [side, side, front, front, front, front]));

    // Roof (gable ends use the wall texture), with a little overhang
    const [roofBase, roofDark] = house.type === 'cottage' ? COTTAGE_ROOFS[index % COTTAGE_ROOFS.length] : style.roof;
    const roofTex = shingles(roofBase, roofDark);
    const gable = wallMaterial(style.wall, 1, 1);
    add(new THREE.Mesh(roofGeometry(w + 0.4, d + 0.4, roofH).translate(0, wallH, 0),
        [gable, new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9 })]));

    // Door and windows on the south face
    const frontZ = d / 2 + 0.03;
    add(new THREE.Mesh(new THREE.BoxGeometry(style.dark ? 0.8 : 0.5, 0.85, 0.06), style.dark ? voidMat : wood)).position.set(0, 0.425, frontZ);
    // The crypt has no lit windows, just a black doorway
    const windowXs = style.dark ? [] : w >= 3.5 ? [-w / 2 + 0.6, w / 2 - 0.6] : w >= 2.5 ? [-w / 2 + 0.55, w / 2 - 0.55] : [];
    for (const x of windowXs) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.05), windowGlow)).position.set(x, wallH * 0.55, frontZ);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.07), wood)).position.set(x, wallH * 0.55 - 0.22, frontZ);
    }
    // A window on each side wall too
    for (const sx of style.dark ? [] : [-1, 1]) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.36), windowGlow)).position.set(sx * (w / 2 + 0.03), wallH * 0.55, 0);
    }

    if (style.chimney) {
        add(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.9, 0.28), chimneyMat)).position.set(w / 2 - 0.5, wallH + roofH * 0.55, -d / 4);
    }
    if (style.sign) {
        const sign = add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.05),
            [wood, wood, wood, wood, new THREE.MeshBasicMaterial({ map: signTexture(style.sign) }), wood]));
        sign.position.set(0, 1.12, frontZ + 0.04);
    }
    if (style.tower) {
        // Bell tower over the entrance
        const towerMat = wallMaterial(style.wall, 0.9, 1.4);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.9), towerMat)).position.set(0, wallH + roofH + 0.3, d / 2 - 0.6);
        add(new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.9, 4).rotateY(Math.PI / 4),
            new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9 }))).position.set(0, wallH + roofH + 1.45, d / 2 - 0.6);
        add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.92), new THREE.MeshStandardMaterial({ color: '#2a2a2a' })))
            .position.set(0, wallH + roofH + 0.55, d / 2 - 0.6);
    }

    group.position.set(center.x, 0, center.z);
    return group;
}

/** @param tileToWorld (col, row) → { x, z } of a tile's centre */
export function buildHouses(scene, houses, tileToWorld) {
    let cottage = 0;
    for (const h of houses) {
        const a = tileToWorld(h.col, h.row);
        const center = { x: a.x + (h.w - 1) / 2, z: a.z + (h.d - 1) / 2 };
        scene.add(buildHouse(h, center, h.type === 'cottage' ? cottage++ : 0));
    }
}
