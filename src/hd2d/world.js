import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grassTop, pathTop, dirt, stoneSide, grassBlades } from './textures.js';

// One character per tile (1 tile = 1 world unit).
//   .  grass          =  dirt path        ,  tall grass
//   T  tree           #  raised ledge     ;  tall grass on a ledge     t  tree on a ledge
const MAP = [
    '..............................',
    '.T....,,,,..........T.........',
    '.....,,,,,,.....#########.....',
    '..T..,,,,,......#;;;;t;;#..T..',
    '................#;;;;;;;#.....',
    '...=============#########.....',
    '...=..........=..........,,,..',
    '...=..######..=.........,,,,,.',
    '...=..#;;t;#..=..T......,,,,..',
    '...=..######..=============...',
    '...=..........=...........=...',
    '..T=....,,,...=....####...=...',
    '...=...,,,,,..=....#t;#...=.T.',
    '...=====......=....####...=...',
    '.......=......=...........=...',
    '..,,,..========...T..,,,..=...',
    '.,,,,,........=.....,,,,,.=...',
    '..,,,....T....=......,,,..=...',
    '..............=============...',
    '.T....,,,,....................',
    '.....,,,,,,.........T.....T...',
    '..............................',
];

const W = MAP[0].length;
const H = MAP.length;
const RAISED = new Set(['#', ';', 't']);
const SOLID = new Set(['#', ';', 't', 'T']);
const LEDGE_H = 0.75;

// Shared clock for wind-swayed grass; main.js advances it every frame
export const timeUniform = { value: 0 };

export function tileToWorld(col, row) {
    return { x: col - W / 2 + 0.5, z: row - H / 2 + 0.5 };
}

function tileAt(x, z) {
    const col = Math.floor(x + W / 2);
    const row = Math.floor(z + H / 2);
    if (row < 0 || row >= H || col < 0 || col >= W) return null;
    return MAP[row][col];
}

// Ground-level tiles something can stand on (spawning)
export function openTiles() {
    const tiles = [];
    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            if (MAP[row][col] === '.' || MAP[row][col] === ',') tiles.push(tileToWorld(col, row));
        }
    }
    return tiles;
}

// For now the player stays on ground level: ledges and trees are walls.
export function isBlocked(x, z) {
    const t = tileAt(x, z);
    return t === null || SOLID.has(t);
}

const std = (tex, extra = {}) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, ...extra });

function addInstances(scene, geometry, material, positions) {
    const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
    const m = new THREE.Matrix4();
    positions.forEach((p, i) => mesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
}

function buildGround(scene) {
    const grassMat = std(grassTop());
    const pathMat = std(pathTop());
    const dirtMat = std(dirt());
    const cliffFull = std(stoneSide(16));
    const cliffLedge = std(stoneSide(Math.round(16 * LEDGE_H)));

    // BoxGeometry face order: +x, -x, +y (top), -y (bottom), +z, -z
    const faces = (top, side) => [side, side, top, dirtMat, side, side];

    const grass = [], path = [], ledges = [];
    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            const ch = MAP[row][col];
            const { x, z } = tileToWorld(col, row);
            (ch === '=' ? path : grass).push({ x, y: -0.5, z });
            if (RAISED.has(ch)) ledges.push({ x, y: LEDGE_H / 2, z });
        }
    }

    const fullBox = new THREE.BoxGeometry(1, 1, 1);
    const halfBox = new THREE.BoxGeometry(1, LEDGE_H, 1);
    addInstances(scene, fullBox, faces(grassMat, cliffFull), grass);
    addInstances(scene, fullBox, faces(pathMat, cliffFull), path);
    addInstances(scene, halfBox, faces(grassMat, cliffLedge), ledges);
}

// Stacked low-poly cones, flat shaded so each facet catches light like a pixel step
function buildTrees(scene) {
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.15, 0.6, 6).translate(0, 0.3, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 1, flatShading: true });
    const tiers = [
        // Bottom tier stays inside its own tile so sprites on the next tile aren't swallowed
        { r: 0.6, h: 0.9, y: 0.95, color: '#1f6b3a' },
        { r: 0.48, h: 0.8, y: 1.4, color: '#2a8247' },
        { r: 0.34, h: 0.65, y: 1.8, color: '#3a9a55' },
    ].map(t => ({
        geo: new THREE.ConeGeometry(t.r, t.h, 8).translate(0, t.y, 0),
        mat: new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.9, flatShading: true }),
    }));

    const r = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            const ch = MAP[row][col];
            if (ch !== 'T' && ch !== 't') continue;
            const { x, z } = tileToWorld(col, row);
            const tree = new THREE.Group();
            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            tree.add(trunk);
            tiers.forEach(t => tree.add(new THREE.Mesh(t.geo, t.mat)));
            tree.traverse(o => { o.castShadow = true; o.receiveShadow = true; });
            tree.position.set(x, ch === 't' ? LEDGE_H : 0, z);
            tree.rotation.y = r() * Math.PI;
            tree.scale.set(0.9 + r() * 0.15, 0.9 + r() * 0.35, 0.9 + r() * 0.15);
            scene.add(tree);
        }
    }
}

// Thousands of grass tufts as two instanced meshes, swaying in a vertex shader
function buildTallGrass(scene) {
    const bladeW = 0.55, bladeH = 0.6;
    // Two crossed quads, each doubled back-to-back instead of using DoubleSide:
    // DoubleSide flips the normal on back faces, which made half the blades render black
    const a = new THREE.PlaneGeometry(bladeW, bladeH).translate(0, bladeH / 2, 0);
    const quads = [0, 1, 2, 3].map(i => a.clone().rotateY(i * Math.PI / 2));
    const tuft = mergeGeometries(quads);
    // Point every normal up so the tufts are lit like the ground they sit on
    const n = tuft.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);

    const material = (flowers) => {
        const mat = new THREE.MeshStandardMaterial({
            map: grassBlades(flowers), alphaTest: 0.5, roughness: 1,
        });
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

    const r = (() => { let s = 42; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const plain = [], flowered = [];
    for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
            const ch = MAP[row][col];
            const dense = ch === ',' || ch === ';';
            const count = dense ? 9 : (ch === '.' && r() < 0.25 ? 1 : 0);
            const { x, z } = tileToWorld(col, row);
            const y = RAISED.has(ch) ? LEDGE_H : 0;
            for (let i = 0; i < count; i++) {
                const m = new THREE.Matrix4()
                    .makeRotationY(r() * Math.PI)
                    .setPosition(x + r() - 0.5, y, z + r() - 0.5)
                    .multiply(new THREE.Matrix4().makeScale(1, 0.8 + r() * 0.5, 1));
                (dense && r() < 0.35 ? flowered : plain).push(m);
            }
        }
    }

    for (const [list, flowers] of [[plain, false], [flowered, true]]) {
        const mesh = new THREE.InstancedMesh(tuft, material(flowers), list.length);
        list.forEach((m, i) => mesh.setMatrixAt(i, m));
        mesh.receiveShadow = true;
        scene.add(mesh);
    }
}

export function buildWorld(scene) {
    buildGround(scene);
    buildTrees(scene);
    buildTallGrass(scene);

    // Sea around the island, so the cliff edges have something to drop into
    const water = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#3f8fd2', roughness: 0.3, metalness: 0.1 })
    );
    water.position.y = -0.7;
    water.receiveShadow = true;
    scene.add(water);
}
