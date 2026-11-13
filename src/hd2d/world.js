import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grassTop, pathTop, dirt, stoneSide, grassBlades, flagstone, dungeonBrick, earth } from './textures.js';
import { buildHouses } from './houses.js';

// A Level is one playable map: the outskirts (overworld) or one floor of the abbey.
// It owns its tile grid, collision, and a THREE.Group with everything it draws.
//
// Overworld tiles: see map.js. Dungeon tiles: see dungeon.js.

const LEDGE_H = 0.75;
const WATER_Y = -0.3;
const WALL_H = 1.25; // dungeon walls: low enough that the camera sees over the ones in front

const RAISED = new Set(['#', ';', 't']);
const SOLID = new Set(['#', ';', 't', 'T', 'F', '~', 'g', 'c', 'H', 'W', 'r']);
const WALKABLE_GROUND = new Set(['.', ',']);

// Shared clock for wind-swayed grass; main.js advances it every frame
export const timeUniform = { value: 0 };

const std = (tex, extra = {}) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, ...extra });
const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

const THEMES = {
    crypt: { floor: () => flagstone([118, 120, 132]), wall: (h) => dungeonBrick([92, 95, 110], h), fog: '#07070b' },
    warrens: { floor: earth, wall: (h) => dungeonBrick([104, 84, 64], h), fog: '#0a0705' },
};

export class Level {
    /**
     * @param grid    array of strings, one character per tile
     * @param options { kind: 'overworld' | 'dungeon', houses, theme, torches }
     */
    constructor(grid, { kind, houses = [], theme = 'crypt', torches = [] }) {
        this.grid = grid;
        this.kind = kind;
        this.W = grid[0].length;
        this.H = grid.length;
        this.theme = THEMES[theme];
        this.group = new THREE.Group();
        this.fires = [];
        this.explored = kind === 'dungeon' ? new Uint8Array(this.W * this.H) : null; // minimap fog of war

        if (kind === 'overworld') {
            this.buildOverworldGround();
            this.buildFences();
            this.buildTrees();
            this.buildGravestones();
            this.buildCampfires();
            this.buildTallGrass();
            this.buildStairs();
            buildHouses(this.group, houses, (c, r) => this.tileToWorld(c, r));
            this.buildWater();
        } else {
            this.buildDungeon();
            this.buildStairs();
            this.buildTorches(torches);
        }
    }

    // --- Coordinates and collision ---------------------------------------------------
    tileToWorld(col, row) {
        return { x: col - this.W / 2 + 0.5, z: row - this.H / 2 + 0.5 };
    }

    worldToTile(x, z) {
        return { col: Math.floor(x + this.W / 2), row: Math.floor(z + this.H / 2) };
    }

    tile(col, row) {
        return this.grid[row]?.[col] ?? null;
    }

    tileAtWorld(x, z) {
        const { col, row } = this.worldToTile(x, z);
        return this.tile(col, row);
    }

    isBlocked(x, z) {
        const t = this.tileAtWorld(x, z);
        return t === null || SOLID.has(t);
    }

    // Ground tiles something can stand on (for spawning), inside a column/row rectangle
    openTiles(c0 = 0, r0 = 0, c1 = this.W - 1, r1 = this.H - 1) {
        const tiles = [];
        for (let row = Math.max(0, r0); row <= Math.min(r1, this.H - 1); row++) {
            for (let col = Math.max(0, c0); col <= Math.min(c1, this.W - 1); col++) {
                if (WALKABLE_GROUND.has(this.grid[row][col])) tiles.push(this.tileToWorld(col, row));
            }
        }
        return tiles;
    }

    forEachTile(fn) {
        for (let row = 0; row < this.H; row++) {
            for (let col = 0; col < this.W; col++) {
                const { x, z } = this.tileToWorld(col, row);
                fn(this.grid[row][col], x, z, col, row);
            }
        }
    }

    // Reveal the minimap around a point (dungeons only)
    explore(pos, radius = 6) {
        if (!this.explored) return;
        const { col, row } = this.worldToTile(pos.x, pos.z);
        for (let r = row - radius; r <= row + radius; r++) {
            for (let c = col - radius; c <= col + radius; c++) {
                if (r >= 0 && c >= 0 && r < this.H && c < this.W && Math.hypot(c - col, r - row) <= radius) this.explored[r * this.W + c] = 1;
            }
        }
    }

    // Per-frame animation (campfire and torch flicker)
    update(t) {
        for (const f of this.fires) {
            const flicker = 0.85 + Math.sin(t * 11 + f.seed) * 0.08 + Math.sin(t * 23 + f.seed * 2) * 0.07;
            f.flame.scale.set(1, flicker, 1);
            if (f.light) f.light.intensity = f.intensity * flicker;
        }
    }

    dispose() {
        this.group.traverse(o => {
            o.geometry?.dispose();
            for (const m of [o.material].flat()) if (m) { m.map?.dispose(); m.dispose(); }
        });
        this.group.removeFromParent();
    }

    // --- Building helpers -------------------------------------------------------------
    add(obj) {
        this.group.add(obj);
        return obj;
    }

    instances(geometry, material, matrices, { cast = true } = {}) {
        if (!matrices.length) return null;
        const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
        matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.castShadow = cast;
        mesh.receiveShadow = true;
        return this.add(mesh);
    }

    buildOverworldGround() {
        const grassMat = std(grassTop());
        const pathMat = std(pathTop());
        const dirtMat = std(dirt());
        const cliffFull = std(stoneSide(16));
        const cliffLedge = std(stoneSide(Math.round(16 * LEDGE_H)));
        // BoxGeometry face order: +x, -x, +y (top), -y (bottom), +z, -z
        const faces = (top, side) => [side, side, top, dirtMat, side, side];

        const grass = [], path = [], ledges = [];
        this.forEachTile((ch, x, z) => {
            if (ch === '~' || ch === '>') return; // water shows through; stairs are built separately
            (ch === '=' ? path : grass).push(at(x, -0.5, z));
            if (RAISED.has(ch)) ledges.push(at(x, LEDGE_H / 2, z));
        });
        const box = new THREE.BoxGeometry(1, 1, 1);
        this.instances(box, faces(grassMat, cliffFull), grass);
        this.instances(box, faces(pathMat, cliffFull), path);
        this.instances(new THREE.BoxGeometry(1, LEDGE_H, 1), faces(grassMat, cliffLedge), ledges);
    }

    buildDungeon() {
        const floorMat = std(this.theme.floor());
        const wallMat = std(this.theme.wall(Math.round(16 * WALL_H)));
        const wallTop = new THREE.MeshStandardMaterial({ color: '#141418', roughness: 1 });
        const floors = [], walls = [];
        this.forEachTile((ch, x, z, col, row) => {
            if (ch === 'W') {
                // Only build walls that border open floor; solid rock further in is never seen
                const nearOpen = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]
                    .some(([dc, dr]) => { const t = this.tile(col + dc, row + dr); return t !== null && t !== 'W'; });
                if (nearOpen) walls.push(at(x, WALL_H / 2, z));
            } else if (ch !== '>') {
                floors.push(at(x, -0.5, z));
            }
        });
        this.instances(new THREE.BoxGeometry(1, 1, 1), [floorMat, floorMat, floorMat, floorMat, floorMat, floorMat], floors);
        this.instances(new THREE.BoxGeometry(1, WALL_H, 1), [wallMat, wallMat, wallTop, wallTop, wallMat, wallMat], walls);

        // Props: sarcophagi (crypt) and boulders (warrens)
        const r = seeded(7);
        const tombs = [], rocks = [];
        this.forEachTile((ch, x, z) => {
            if (ch === 'g') tombs.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
            if (ch === 'r') rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.25, z),
                new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), new THREE.Vector3(1, 0.8 + r() * 0.4, 1)));
        });
        const tomb = mergeGeometries([
            new THREE.BoxGeometry(0.7, 0.45, 0.9).translate(0, 0.225, 0),
            new THREE.BoxGeometry(0.78, 0.1, 0.98).translate(0, 0.5, 0),
        ]);
        this.instances(tomb, new THREE.MeshStandardMaterial({ color: '#7d7f8a', roughness: 1, flatShading: true }), tombs);
        this.instances(new THREE.DodecahedronGeometry(0.42), new THREE.MeshStandardMaterial({ color: '#6b5a48', roughness: 1, flatShading: true }), rocks);
    }

    // Stairs: '>' steps down into the ground, '<' steps up toward the exit
    buildStairs() {
        const stone = new THREE.MeshStandardMaterial({ color: '#8d9099', roughness: 1, flatShading: true });
        const dark = new THREE.MeshBasicMaterial({ color: '#030304' });
        const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9ec5ff').multiplyScalar(1.6), transparent: true, opacity: 0.5 });
        this.forEachTile((ch, x, z) => {
            if (ch === '>') {
                // A dark pit with steps descending north (away from the camera)
                this.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1), dark)).position.set(x, -0.9, z);
                for (let i = 0; i < 4; i++) {
                    const step = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.25), stone));
                    step.position.set(x, -0.1 - i * 0.2, z + 0.375 - i * 0.25);
                    step.receiveShadow = true;
                }
            } else if (ch === '<') {
                // Steps rising north, with a faint light from above
                for (let i = 0; i < 4; i++) {
                    const step = this.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2 + i * 0.25, 0.25), stone));
                    step.position.set(x, (0.2 + i * 0.25) / 2, z + 0.375 - i * 0.25);
                    step.castShadow = step.receiveShadow = true;
                }
                this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 3, 16, 1, true), glow)).position.set(x, 1.5, z);
                const light = this.add(new THREE.PointLight('#9ec5ff', 4, 6, 1.5));
                light.position.set(x, 1.5, z);
            }
        });
    }

    // Wall torches: a bracket and flame on the wall face toward the camera; every other one casts light
    buildTorches(torches) {
        const bracket = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 1 });
        const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c').multiplyScalar(3) });
        torches.forEach((t, i) => {
            const { x, z } = this.tileToWorld(t.col, t.row);
            const fz = z + 0.55;
            this.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.12), bracket)).position.set(x, 0.85, fz);
            const flame = this.add(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6).translate(0, 0.11, 0), flameMat));
            flame.position.set(x, 1.0, fz);
            let light = null;
            if (i % 2 === 0) {
                light = this.add(new THREE.PointLight('#ff8a30', 4, 6, 1.8));
                light.position.set(x, 1.1, fz + 0.3);
            }
            this.fires.push({ flame, light, intensity: 4, seed: i * 1.7 });
        });
    }

    // Stacked low-poly cones, flat shaded so each facet catches light like a pixel step.
    // One instanced mesh per part keeps hundreds of trees to four draw calls.
    buildTrees() {
        const parts = [
            { geo: new THREE.CylinderGeometry(0.1, 0.15, 0.6, 6).translate(0, 0.3, 0), color: '#7a4a2a' },
            // Bottom tier stays inside its own tile so sprites on the next tile aren't swallowed
            { geo: new THREE.ConeGeometry(0.6, 0.9, 8).translate(0, 0.95, 0), color: '#1f6b3a' },
            { geo: new THREE.ConeGeometry(0.48, 0.8, 8).translate(0, 1.4, 0), color: '#2a8247' },
            { geo: new THREE.ConeGeometry(0.34, 0.65, 8).translate(0, 1.8, 0), color: '#3a9a55' },
        ];
        const r = seeded(99);
        const matrices = [];
        this.forEachTile((ch, x, z) => {
            if (ch !== 'T' && ch !== 't') return;
            matrices.push(new THREE.Matrix4().compose(
                new THREE.Vector3(x, ch === 't' ? LEDGE_H : 0, z),
                new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI),
                new THREE.Vector3(0.9 + r() * 0.15, 0.9 + r() * 0.35, 0.9 + r() * 0.15),
            ));
        });
        for (const p of parts) {
            this.instances(p.geo, new THREE.MeshStandardMaterial({ color: p.color, roughness: 0.9, flatShading: true }), matrices);
        }
    }

    // Fence posts on every F tile, with rails joining neighbouring posts — merged into one mesh
    buildFences() {
        const post = new THREE.BoxGeometry(0.14, 0.7, 0.14).translate(0, 0.35, 0);
        const railX = new THREE.BoxGeometry(1, 0.08, 0.06);
        const railZ = new THREE.BoxGeometry(0.06, 0.08, 1);
        const pieces = [];
        this.forEachTile((ch, x, z, col, row) => {
            if (ch !== 'F') return;
            pieces.push(post.clone().translate(x, 0, z));
            for (const y of [0.25, 0.52]) {
                if (this.tile(col + 1, row) === 'F') pieces.push(railX.clone().translate(x + 0.5, y, z));
                if (this.tile(col, row + 1) === 'F') pieces.push(railZ.clone().translate(x, y, z + 0.5));
            }
        });
        if (!pieces.length) return;
        const mesh = this.add(new THREE.Mesh(mergeGeometries(pieces),
            new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 1, flatShading: true })));
        mesh.castShadow = mesh.receiveShadow = true;
    }

    // Weathered headstones, slightly tilted
    buildGravestones() {
        const stone = mergeGeometries([
            new THREE.BoxGeometry(0.42, 0.5, 0.12).translate(0, 0.25, 0),
            new THREE.CylinderGeometry(0.21, 0.21, 0.12, 10, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0.5, 0),
            new THREE.BoxGeometry(0.55, 0.08, 0.3).translate(0, 0.04, 0),
        ]);
        const r = seeded(31);
        const matrices = [];
        this.forEachTile((ch, x, z) => {
            if (ch !== 'g') return;
            matrices.push(new THREE.Matrix4().compose(
                new THREE.Vector3(x, 0, z),
                new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.2, (r() - 0.5) * 0.3, (r() - 0.5) * 0.25)),
                new THREE.Vector3(1, 0.85 + r() * 0.3, 1),
            ));
        });
        this.instances(stone, new THREE.MeshStandardMaterial({ color: '#8d9099', roughness: 1, flatShading: true }), matrices);
    }

    // Campfires: crossed logs, a glowing flame and a flickering light
    buildCampfires() {
        const logMat = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1, flatShading: true });
        const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c').multiplyScalar(2.5) });
        this.forEachTile((ch, x, z) => {
            if (ch !== 'c') return;
            for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
                const log = this.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 6).rotateZ(Math.PI / 2), logMat));
                log.rotation.y = a;
                log.position.set(x, 0.07, z);
                log.castShadow = true;
            }
            const flame = this.add(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6).translate(0, 0.25, 0), flameMat));
            flame.position.set(x, 0.08, z);
            const light = this.add(new THREE.PointLight('#ff8a30', 6, 7, 1.6));
            light.position.set(x, 0.7, z);
            this.fires.push({ flame, light, intensity: 6, seed: Math.random() * 10 });
        });
    }

    // Thousands of grass tufts as two instanced meshes, swaying in a vertex shader
    buildTallGrass() {
        const bladeW = 0.55, bladeH = 0.6;
        // Two crossed quads, each doubled back-to-back instead of using DoubleSide:
        // DoubleSide flips the normal on back faces, which made half the blades render black
        const a = new THREE.PlaneGeometry(bladeW, bladeH).translate(0, bladeH / 2, 0);
        const tuft = mergeGeometries([0, 1, 2, 3].map(i => a.clone().rotateY(i * Math.PI / 2)));
        // Point every normal up so the tufts are lit like the ground they sit on
        const n = tuft.attributes.normal;
        for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);

        const material = (flowers) => {
            const mat = new THREE.MeshStandardMaterial({ map: grassBlades(flowers), alphaTest: 0.5, roughness: 1 });
            mat.onBeforeCompile = (shader) => {
                shader.uniforms.uTime = timeUniform;
                shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
                    '#include <begin_vertex>',
                    `#include <begin_vertex>
                    vec3 root = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                    transformed.x += sin(uTime * 1.8 + root.x * 0.9 + root.z * 0.7) * 0.25 * transformed.y;`
                );
            };
            return mat;
        };

        const r = seeded(42);
        const plain = [], flowered = [];
        this.forEachTile((ch, x, z) => {
            const dense = ch === ',' || ch === ';';
            const count = dense ? 9 : (ch === '.' && r() < 0.25 ? 1 : 0);
            const y = RAISED.has(ch) ? LEDGE_H : 0;
            for (let i = 0; i < count; i++) {
                const m = new THREE.Matrix4()
                    .makeRotationY(r() * Math.PI)
                    .setPosition(x + r() - 0.5, y, z + r() - 0.5)
                    .multiply(new THREE.Matrix4().makeScale(1, 0.8 + r() * 0.5, 1));
                (dense && r() < 0.35 ? flowered : plain).push(m);
            }
        });
        this.instances(tuft, material(false), plain, { cast: false });
        this.instances(tuft, material(true), flowered, { cast: false });
    }

    // Sea around the island and the river/pond inside it
    buildWater() {
        const water = this.add(new THREE.Mesh(
            new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: '#3f8fd2', roughness: 0.25, metalness: 0.1 })
        ));
        water.position.y = WATER_Y;
        water.receiveShadow = true;
    }
}
