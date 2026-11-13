import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { HorizontalTiltShiftShader } from 'three/addons/shaders/HorizontalTiltShiftShader.js';
import { VerticalTiltShiftShader } from 'three/addons/shaders/VerticalTiltShiftShader.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { keys } from '../input.js';
import { buildWorld, isBlocked, openTiles, tileToWorld, timeUniform } from './world.js';
import { Player, loadPlayerSheets } from './Player.js';
import { Slime, loadSlimeSheets } from './Slime.js';
import { Inventory, InventoryUI } from './Inventory.js';
import { ITEMS } from './items.js';
import * as ui from './ui.js';

const SKY = '#a9d6ee';
const CAMERA_OFFSET = new THREE.Vector3(0, 11, 12.5);
const TILT_BLUR = 6; // pixels of blur strength at the top/bottom edges
const SLIME_SPAWNS = [[6, 3], [24, 7], [9, 16], [22, 16]];
const MAX_SLIMES = 4;
const RESPAWN_SECONDS = 8;
const SWORD_DAMAGE = 5;

// --- Renderer, scene, camera ---------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; // keeps sprite colours close to the originals
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 24, 55);

const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 120);

// --- Lighting -------------------------------------------------------------------
scene.add(new THREE.HemisphereLight('#d6ecff', '#4d6e3c', 1.3));

const sun = new THREE.DirectionalLight('#fff2d8', 2.3);
sun.position.set(-7, 12, 5); // upper-left, in front: cliff faces lit, shadows fall back and to the right
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);

// --- World ----------------------------------------------------------------------
buildWorld(scene);
await Promise.all([loadPlayerSheets(), loadSlimeSheets()]);

// Fireflies: tiny HDR points that the bloom pass turns into soft glows
const FIREFLIES = 70;
const fireflyBase = [];
const fireflyGeo = new THREE.BufferGeometry();
const fireflyPos = new Float32Array(FIREFLIES * 3);
for (let i = 0; i < FIREFLIES; i++) {
    fireflyBase.push({ x: (Math.random() - 0.5) * 28, y: 0.4 + Math.random() * 1.4, z: (Math.random() - 0.5) * 20, p: Math.random() * 10 });
}
fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
scene.add(new THREE.Points(fireflyGeo, new THREE.PointsMaterial({
    color: new THREE.Color('#fff6b0').multiplyScalar(3), size: 0.07,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
})));

// --- Post-processing: bloom, tilt-shift (the "miniature" blur), vignette -------
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.9));
const tiltH = new ShaderPass(HorizontalTiltShiftShader);
const tiltV = new ShaderPass(VerticalTiltShiftShader);
tiltH.uniforms.r.value = tiltV.uniforms.r.value = 0.5;
composer.addPass(tiltH);
composer.addPass(tiltV);
const vignette = new ShaderPass(VignetteShader);
vignette.uniforms.offset.value = 0.95;
vignette.uniforms.darkness.value = 1.1;
composer.addPass(vignette);
composer.addPass(new OutputPass());
let effectsOn = true;

function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    tiltH.uniforms.h.value = TILT_BLUR / w;
    tiltV.uniforms.v.value = TILT_BLUR / h;
}
window.addEventListener('resize', resize);
resize();

// --- Game state -----------------------------------------------------------------
const inventory = new Inventory();
const inventoryUI = new InventoryUI(inventory);
let player, slimes, respawnTimer;

function spawnSlime(pos) {
    const s = new Slime(pos.x, pos.z);
    scene.add(s.mesh);
    slimes.push(s);
}

function startGame() {
    if (player) scene.remove(player.mesh);
    slimes?.forEach(s => scene.remove(s.mesh));

    const start = tileToWorld(14, 10);
    player = new Player(start.x, start.z);
    scene.add(player.mesh);
    slimes = [];
    SLIME_SPAWNS.forEach(([col, row]) => spawnSlime(tileToWorld(col, row)));
    respawnTimer = 0;

    inventory.reset();
    inventory.add('sword');
    inventory.add('hoe');
    inventory.add('turnip_seeds', 10);
    inventory.add('potion', 3);
    inventory.select(0);

    camera.position.copy(player.position).add(CAMERA_OFFSET);
    ui.showGameOver(false);
}

// --- Movement -------------------------------------------------------------------
const RADIUS = 0.22;
function blockedAt(x, z) {
    return isBlocked(x - RADIUS, z - RADIUS) || isBlocked(x + RADIUS, z - RADIUS)
        || isBlocked(x - RADIUS, z + RADIUS) || isBlocked(x + RADIUS, z + RADIUS);
}

// Move on each axis separately so you slide along walls instead of sticking
function tryMove(obj, dx, dz) {
    const p = obj.position;
    if (!blockedAt(p.x + dx, p.z)) p.x += dx;
    if (!blockedAt(p.x, p.z + dz)) p.z += dz;
}

const above = (obj, h) => obj.position.clone().add(new THREE.Vector3(0, h, 0));

// --- Input ----------------------------------------------------------------------
let mouseHeld = false;

window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '5') inventory.select(Number(k) - 1);
    else if (k === 'e' || k === 'i') inventoryUI.toggle();
    else if (k === 'escape') inventoryUI.close();
    else if (k === 'r' && player.dead) startGame();
    else if (k === 'f') {
        effectsOn = !effectsOn;
        document.getElementById('fx-state').textContent = effectsOn ? 'on' : 'off';
    }
});
window.addEventListener('wheel', (e) => {
    if (!inventoryUI.isOpen) inventory.select(inventory.selected + Math.sign(e.deltaY));
}, { passive: true });

// Only clicks on the game itself use items — clicks on the hotbar/backpack don't swing the sword
renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouseHeld = true;
    useSelectedItem();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

function useSelectedItem() {
    const item = inventory.selectedItem;
    if (!item || player.dead) return;
    if (item.weapon) {
        player.tryAttack();
    } else if (item.heal) {
        if (player.health >= player.maxHealth) return ui.showLabel('Already at full health');
        player.heal(item.heal);
        inventory.consumeSelected();
        ui.floatText(above(player, 1.6), `+${item.heal}`, '#2ecc71');
    } else {
        ui.showLabel(`${item.name}: farming isn't built yet`);
    }
}

// --- Update ---------------------------------------------------------------------
function dropLoot(slime) {
    const drops = [['slime_gel', 1]];
    if (Math.random() < 0.25) drops.push(['potion', 1]);
    drops.forEach(([id, n], i) => {
        const pos = above(slime, 0.8 + i * 0.35);
        if (inventory.add(id, n) > 0) ui.floatText(pos, 'Backpack full', '#ff9f43');
        else ui.floatText(pos, `+${n} ${ITEMS[id].name}`, '#7bed9f');
    });
}

function update(dt) {
    const input = {
        x: (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
        z: (keys.s ? 1 : 0) - (keys.w ? 1 : 0),
        run: keys.shift,
    };
    if (player.state !== 'attack') player.weapon = inventory.selectedItem?.weapon ?? 'unarmed';
    if (mouseHeld && player.weapon === 'sword') player.tryAttack(); // hold to keep swinging
    player.update(dt, input, tryMove, camera);

    // Sword connects: hit every slime near the point in front of the player
    if (player.swingHit) {
        player.swingHit = false;
        const hit = player.attackPoint();
        for (const s of slimes) {
            if (Math.hypot(s.position.x - hit.x, s.position.z - hit.z) < 0.8 && s.takeDamage(SWORD_DAMAGE, player.position)) {
                ui.floatText(above(s, 1.0), `-${SWORD_DAMAGE}`, '#ff4757');
            }
        }
    }

    for (const s of slimes) {
        s.update(dt, player, tryMove, camera);
        if (s.hitPlayer) {
            s.hitPlayer = false;
            if (player.takeDamage(s.damage)) ui.floatText(above(player, 1.6), `-${s.damage}`, '#f1c40f');
        }
    }

    slimes = slimes.filter(s => {
        if (s.state !== 'dead') return true;
        scene.remove(s.mesh);
        dropLoot(s);
        return false;
    });

    // Keep the island populated: respawn away from the player
    if (slimes.length < MAX_SLIMES && (respawnTimer += dt) > RESPAWN_SECONDS) {
        respawnTimer = 0;
        const far = openTiles().filter(t => Math.hypot(t.x - player.position.x, t.z - player.position.z) > 7);
        if (far.length) spawnSlime(far[Math.floor(Math.random() * far.length)]);
    }

    ui.setBars(player);
    ui.showGameOver(player.dead && player.sprite.done);
}

// --- Main loop ------------------------------------------------------------------
const camTarget = new THREE.Vector3();
let last = performance.now();

function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    timeUniform.value = now / 1000;

    update(dt);

    // Smooth follow camera
    camTarget.copy(player.position).add(CAMERA_OFFSET);
    camera.position.lerp(camTarget, 1 - Math.exp(-dt * 5));
    camera.lookAt(player.position.x, player.position.y + 0.6, player.position.z + 0.5);

    const t = now / 1000;
    fireflyBase.forEach((f, i) => {
        fireflyPos[i * 3] = f.x + Math.sin(t * 0.4 + f.p) * 0.8;
        fireflyPos[i * 3 + 1] = f.y + Math.sin(t * 1.3 + f.p * 2) * 0.25;
        fireflyPos[i * 3 + 2] = f.z + Math.cos(t * 0.35 + f.p) * 0.8;
    });
    fireflyGeo.attributes.position.needsUpdate = true;

    ui.updateFloats(dt, camera);
    if (effectsOn) composer.render();
    else renderer.render(scene, camera);
    requestAnimationFrame(loop);
}

startGame();
requestAnimationFrame(loop);
