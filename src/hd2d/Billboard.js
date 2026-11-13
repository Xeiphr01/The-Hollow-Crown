import * as THREE from 'three';

// A 2D sprite-sheet character standing upright in the 3D world, turned to face the camera.
// Sheets are grids of square frames; rows are directions (0 down, 1 left, 2 right, 3 up).

const sheets = new Map();
const images = new Map();
const camDir = new THREE.Vector3();

// Each layer file is fetched once, however many sheets stack it
function loadImage(src) {
    if (!images.has(src)) {
        images.set(src, new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load ${src}`));
            img.src = src;
        }));
    }
    return images.get(src);
}

export const hasSheet = (key) => sheets.has(key);

// The composited canvas behind a sheet (used for dialogue portraits)
export const sheetCanvas = (key) => sheets.get(key).image;

/**
 * Stack layer images (body, armor, hair, weapon...) into one sheet texture stored under `key`.
 * Only the top `rows` rows of the grid are kept — the sprite pack leaves the rest empty.
 * Call again with the same key and different layers to change equipment.
 */
export async function loadSheet(key, layers, { frame = 128, rows = 4 } = {}) {
    const imgs = await Promise.all(layers.map(loadImage));
    const canvas = document.createElement('canvas');
    canvas.width = imgs[0].width;
    canvas.height = frame * rows;
    const g = canvas.getContext('2d');
    imgs.forEach(img => g.drawImage(img, 0, 0));

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.userData = { frame, cols: canvas.width / frame, rows };
    sheets.set(key, tex);
}

export class Billboard {
    /**
     * @param anims  { name: { sheet, frames, speed, loop } } — frames lists the grid columns to play;
     *               loop: false plays once and holds the last frame (sets `done`)
     * @param ppu    sprite pixels per world unit
     * @param feetPx pixel row (from the top of a frame) where the feet touch the ground
     * @param silhouette draw a dark outline of the sprite when something is in front of it
     * @param scale  draw bigger or smaller than the sheet's pixel size (bosses)
     */
    constructor(anims, { ppu = 72, feetPx = 123, silhouette = false, scale = 1 } = {}) {
        this.anims = {};
        for (const [name, a] of Object.entries(anims)) {
            // Each billboard needs its own texture copy (shared image) to show its own frame
            const tex = sheets.get(a.sheet).clone();
            const { cols, rows } = tex.userData;
            tex.repeat.set(1 / cols, 1 / rows);
            this.anims[name] = { loop: true, ...a, tex };
        }

        const first = Object.values(this.anims)[0].tex;
        const frame = first.userData.frame;
        const size = (frame / ppu) * scale;
        // Shift the quad up so the feet sit exactly on the object's origin
        const geo = new THREE.PlaneGeometry(size, size).translate(0, ((feetPx - frame / 2) / ppu) * scale, 0);
        this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: first, alphaTest: 0.5, side: THREE.DoubleSide }));
        this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking, map: first, alphaTest: 0.5,
        });
        this.mesh.castShadow = true;

        if (silhouette) {
            // Only drawn where something nearer already covers the sprite (GreaterDepth)
            this.ghost = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
                map: first, color: '#1d2a4a', transparent: true, opacity: 0.55, alphaTest: 0.5,
                depthWrite: false, depthFunc: THREE.GreaterDepth,
            }));
            this.ghost.renderOrder = 10;
            this.mesh.add(this.ghost);
        }

        this.row = 0;
        this.frame = 0; // index into the current animation's `frames` list
        this.timer = 0;
        this.done = false;
        this.current = null;
        this.play(Object.keys(this.anims)[0]);
    }

    get position() { return this.mesh.position; }

    // Point every animation at a different sheet with the same layout (e.g. new equipment)
    setSheet(key) {
        for (const a of Object.values(this.anims)) {
            a.tex.dispose();
            a.tex = sheets.get(key).clone();
            const { cols, rows } = a.tex.userData;
            a.tex.repeat.set(1 / cols, 1 / rows);
            a.sheet = key;
        }
        const name = this.current;
        this.current = null;
        const { frame, timer } = this;
        this.play(name);
        Object.assign(this, { frame, timer });
    }

    play(name, restart = false) {
        if (this.current === name && !restart) return;
        this.current = name;
        this.frame = 0;
        this.timer = 0;
        this.done = false;
        const tex = this.anims[name].tex;
        this.mesh.material.map = tex;
        this.mesh.customDepthMaterial.map = tex;
        if (this.ghost) this.ghost.material.map = tex;
    }

    update(dt, camera) {
        const a = this.anims[this.current];
        const count = a.frames.length;
        this.timer += dt;
        if (this.timer >= a.speed) {
            this.timer -= a.speed;
            if (this.frame < count - 1) this.frame++;
            else if (a.loop) this.frame = 0;
            else this.done = true;
        }
        const { cols, rows } = a.tex.userData;
        // Texture v runs bottom-up, so row 0 (top of the sheet) is the highest band
        a.tex.offset.set(a.frames[this.frame] / cols, 1 - (this.row + 1) / rows);

        // Stand upright and turn toward the camera. Leaning back to face it fully made sprites
        // clip into whatever stood behind them (trees). Stretch vertically to undo the
        // foreshortening from the camera looking down, so the art keeps its proportions.
        camera.getWorldDirection(camDir);
        this.mesh.rotation.set(0, Math.atan2(-camDir.x, -camDir.z), 0);
        this.mesh.scale.y = 1 / Math.sqrt(1 - camDir.y * camDir.y);
    }
}
