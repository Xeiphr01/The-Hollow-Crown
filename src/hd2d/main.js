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
import { Level, timeUniform } from './world.js';
import { MAP, HOUSES, START } from './map.js';
import { generateFloor, FLOORS, FLOOR_ENEMIES } from './dungeon.js';
import { Player, playerLayers, loadPlayerSheet } from './Player.js';
import { Enemy, loadEnemySheets } from './Enemy.js';
import { Zone, OUTSKIRTS_ZONES } from './zones.js';
import { NPC, loadNpcSheets } from './NPC.js';
import { NPC_DEFS } from './npcs.js';
import { Inventory, InventoryUI } from './Inventory.js';
import { Dialogue, Shop } from './talk.js';
import { ITEMS, itemInfo, rollEquipment, RARITY_COLORS } from './items.js';
import { GroundItem } from './loot.js';
import { QuestLog, QuestLogUI, LORE, INTRO } from './quests.js';
import { Minimap } from './minimap.js';
import { loadSave, writeSave, clearSave } from './save.js';
import * as ui from './ui.js';

const SKY = '#a9d6ee';
const CAMERA_OFFSET = new THREE.Vector3(0, 11, 12.5);
const TILT_BLUR = 6;           // pixels of blur strength at the top/bottom edges
const RESPAWN_SECONDS = 10;    // outskirts zones refill one enemy at a time
const SPAWN_MIN_DIST = 9;      // enemies never pop in right next to you
const PICKUP_RANGE = 0.6;
const STARTING_GOLD = 30;
const ABBEY_DOOR = { col: 32, row: 7 };   // where you surface from the abbey (in front of the crypt steps)
const TOWN_PORTAL = { col: 32, row: 40 }; // where Return Scrolls set you down
const ALPHA_DEN = { col: 11, row: 20 };   // Whisperwood clearing

// --- Renderer, scene, camera ---------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; // keeps sprite colours close to the originals
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(SKY, 24, 55);
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 120);

// --- Lighting -------------------------------------------------------------------
const hemi = new THREE.HemisphereLight('#d6ecff', '#4d6e3c', 1.3);
scene.add(hemi);

// Upper-left, in front: cliff faces lit, shadows fall back and to the right. The light follows
// the player so a small, sharp shadow map covers whatever is on screen, however big the map gets.
const SUN_OFFSET = new THREE.Vector3(-7, 12, 5);
const sun = new THREE.DirectionalLight('#fff2d8', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// The lantern you carry in the abbey
const lantern = new THREE.PointLight('#ffc58a', 0, 13, 1.2);
scene.add(lantern);

// Fireflies: tiny HDR points that the bloom pass turns into soft glows. They drift around the player.
const FIREFLIES = 70;
const fireflyBase = [];
const fireflyGeo = new THREE.BufferGeometry();
const fireflyPos = new Float32Array(FIREFLIES * 3);
for (let i = 0; i < FIREFLIES; i++) {
    fireflyBase.push({ x: (Math.random() - 0.5) * 28, y: 0.4 + Math.random() * 1.4, z: (Math.random() - 0.5) * 28, p: Math.random() * 10 });
}
fireflyGeo.setAttribute('position', new THREE.BufferAttribute(fireflyPos, 3));
const fireflies = new THREE.Points(fireflyGeo, new THREE.PointsMaterial({
    color: new THREE.Color('#fff6b0').multiplyScalar(3), size: 0.07,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
}));
fireflies.frustumCulled = false;
scene.add(fireflies);

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

// --- World ----------------------------------------------------------------------
await Promise.all([loadEnemySheets(), loadNpcSheets(NPC_DEFS)]);
const outskirts = new Level(MAP, { kind: 'overworld', houses: HOUSES });
const outskirtsZones = OUTSKIRTS_ZONES.map(d => new Zone(d, outskirts));
const minimap = new Minimap(document.getElementById('minimap'));

let level = null;   // the Level being played
let depth = 0;      // 0 = the outskirts, 1+ = abbey floor
let floor = null;   // dungeon generator output for the current floor
let zones = [];

// --- Game state -----------------------------------------------------------------
const inventory = new Inventory();
const quests = new QuestLog();
const questUI = new QuestLogUI(quests);
const dialogue = new Dialogue();
const shop = new Shop(inventory);
let player = null, enemies = [], npcs = [], ground = [], flags = {}, portal = null, portalMesh = null;
let currentZone = null, transitioning = false, started = false, smithStock = null;

const attackPower = () => (player.weapon?.damage ?? 0) + inventory.bonuses.damage + (player.level - 1);
const maxHealth = () => player.baseHealth + inventory.bonuses.hp + (flags.vigor ?? 0);
const inventoryUI = new InventoryUI(inventory, () => (player
    ? { atk: attackPower(), def: player.defense, hp: player.maxHealth }
    : { atk: 0, def: 0, hp: 0 }));

// Worn gear and the held item decide the player's stats and which layers they're drawn with
function refreshGear() {
    if (!player) return;
    const held = inventory.selectedItem;
    player.weapon = held?.damage ? held : null;
    player.defense = inventory.bonuses.defense;
    player.setMaxHealth(maxHealth());
    player.setAppearance(playerLayers(inventory.gear));
    inventoryUI.render();
}
inventory.onChange(refreshGear);

// A quest whose goal you've already met (boss killed early, item already found) is ready
// the moment it starts
const QUEST_GOALS = {
    silent_bell: () => (flags.deepest ?? 0) >= 1,
    gravewarden: () => flags.bossDead?.[2],
    whispers_below: () => (flags.deepest ?? 0) >= 3,
    chieftain: () => flags.bossDead?.[4],
    alpha: () => flags.alphaDead,
    signet: () => inventory.count('aldrens_signet') > 0,
};
function syncQuests() {
    for (const [id, met] of Object.entries(QUEST_GOALS)) if (quests.is(id, 'active') && met()) quests.ready(id);
}
quests.onChange(() => {
    syncQuests();
    save();
});

const lorePages = () => Object.keys(flags.lore ?? {}).length;
const above = (obj, h) => obj.position.clone().add(new THREE.Vector3(0, h, 0));

function save() {
    if (!started || !player) return;
    writeSave({
        version: 1,
        inventory: inventory.toJSON(),
        player: { level: player.level, xp: player.xp },
        quests: quests.toJSON(),
        flags,
        portal,
    });
}

// --- Spawning -------------------------------------------------------------------
function spawnEnemy(type, pos, zone, power = 1) {
    const e = new Enemy(type, pos.x, pos.z, zone, power);
    scene.add(e.mesh);
    enemies.push(e);
    return e;
}

const aliveIn = (zone) => enemies.filter(e => e.zone === zone && !e.def.boss).length;

function dropOnGround(kind, payload, pos) {
    // Scatter a little so several drops don't stack on one spot
    for (let i = 0; i < 6; i++) {
        const x = pos.x + (Math.random() - 0.5) * 1.2, z = pos.z + (Math.random() - 0.5) * 1.2;
        if (!level.isBlocked(x, z)) { pos = { x, z }; break; }
    }
    const g = new GroundItem(kind, payload, pos.x, pos.z);
    scene.add(g.group);
    ground.push(g);
}

function clearLevelContents() {
    enemies.forEach(e => scene.remove(e.mesh));
    enemies = [];
    ground.forEach(g => g.dispose());
    ground = [];
}

// --- Levels and travel ----------------------------------------------------------
function setOutdoorLighting() {
    scene.background = new THREE.Color(SKY);
    scene.fog.color.set(SKY);
    scene.fog.near = 24; scene.fog.far = 55;
    hemi.intensity = 1.3;
    sun.intensity = 2.3;
    lantern.intensity = 0;
    fireflies.visible = true;
}

function setDungeonLighting() {
    scene.background = new THREE.Color('#000');
    // Fog distance is measured from the camera, which sits ~16.6 units from the player:
    // the darkness has to start beyond that or it swallows you too
    scene.fog.color.set(level.theme.fog);
    scene.fog.near = 15; scene.fog.far = 30;
    hemi.intensity = 0.5;
    sun.intensity = 0.6; // just enough to keep some shape and shadow in the dark
    lantern.intensity = 14;
    fireflies.visible = false;
}

function placePlayer(pos) {
    player.position.set(pos.x, 0, pos.z);
    camera.position.copy(player.position).add(CAMERA_OFFSET);
}

/**
 * Travel to the outskirts (0) or an abbey floor (1+).
 * @param arrive 'start' (top of the floor) | 'below' (by the stairs down) | 'abbey-door' | 'town' | 'portal'
 */
async function travel(toDepth, arrive) {
    if (transitioning) return;
    transitioning = true;
    dialogue.close(); shop.close();
    await ui.fade(true);

    clearLevelContents();
    if (level === outskirts) scene.remove(outskirts.group);
    else level?.dispose();
    npcs.forEach(n => scene.remove(n.mesh));
    if (portalMesh) { scene.remove(portalMesh); portalMesh = null; }
    const cameFrom = depth;
    depth = toDepth;

    if (depth === 0) {
        level = outskirts;
        scene.add(outskirts.group);
        zones = outskirtsZones;
        npcs.forEach(n => scene.add(n.mesh));
        setOutdoorLighting();
        const tile = arrive === 'abbey-door' ? ABBEY_DOOR : arrive === 'portal' || arrive === 'town' ? { col: TOWN_PORTAL.col, row: TOWN_PORTAL.row + 1 } : START;
        placePlayer(level.tileToWorld(tile.col, tile.row));
        for (const zone of zones) {
            zone.respawnTimer = 0;
            for (let i = 0; zone.enemies && i < zone.max; i++) {
                const pos = zone.spawnPoint(player.position, SPAWN_MIN_DIST);
                if (pos) spawnEnemy(zone.pickEnemy(), pos, zone);
            }
        }
        if (portal) buildPortal();
        if (cameFrom > 0) smithStock = null; // Hilda restocks while you're away
        ui.setLocation('Willowbrook · The Outskirts');
    } else {
        flags.seeds ??= {};
        flags.seeds[depth] ??= Math.floor(Math.random() * 1e9);
        const info = FLOORS[depth];
        floor = generateFloor(depth, flags.seeds[depth]);
        level = new Level(floor.grid, { kind: 'dungeon', theme: info.theme, torches: floor.torches });
        scene.add(level.group);
        setDungeonLighting();
        const tile = arrive === 'below' ? { col: floor.down.col, row: floor.down.row + 1 } : floor.start;
        placePlayer(arrive === 'portal' ? portal.pos : level.tileToWorld(tile.col, tile.row));
        if (arrive === 'portal') portal = null;

        // One zone covering the whole floor, minus the room you arrive in
        const r = floor.startRoom;
        const zone = new Zone({ name: info.name, cols: [0, level.W - 1], rows: [0, level.H - 1], enemies: FLOOR_ENEMIES[info.theme] }, level);
        zone.tiles = zone.tiles.filter(t => {
            const { col, row } = level.worldToTile(t.x, t.z);
            return !(col >= r.x - 1 && col <= r.x + r.w && row >= r.y - 1 && row <= r.y + r.h);
        });
        zones = [zone];
        const power = 1 + 0.3 * (depth - 1);
        for (let i = 0; i < 8 + depth * 3; i++) {
            const pos = zone.spawnPoint(player.position, 6);
            if (pos) spawnEnemy(zone.pickEnemy(), pos, zone, power);
        }
        if (info.boss && !flags.bossDead?.[depth]) {
            const b = floor.bossRoom;
            spawnEnemy(info.boss, level.tileToWorld(b.x + Math.floor(b.w / 2), b.y + Math.floor(b.h / 2) + 1), zone);
        }
        if (!flags.lore?.[depth]) dropOnGround('lore', depth, level.tileToWorld(floor.loreSpot.col, floor.loreSpot.row));
        if (depth === 3 && !flags.signetFound) {
            dropOnGround('item', { id: 'aldrens_signet', count: 1 }, level.tileToWorld(floor.questSpot.col, floor.questSpot.row));
        }
        flags.deepest = Math.max(flags.deepest ?? 0, depth);
        syncQuests();
        ui.setLocation(`Sunken Abbey · Floor ${depth}: ${info.name}`);
    }

    minimap.setLevel(level);
    currentZone = null;
    stepOffTrigger = true; // don't bounce straight back if we arrived on a trigger
    save();
    await ui.fade(false);
    transitioning = false;
    if (depth > 0) ui.showZone(FLOORS[depth].name, `The Sunken Abbey · Floor ${depth}`);
}

// Town portal left behind by a Return Scroll: a ring of blue light in the plaza
function buildPortal() {
    const pos = outskirts.tileToWorld(TOWN_PORTAL.col, TOWN_PORTAL.row);
    portalMesh = new THREE.Group();
    const color = new THREE.Color('#5aa9ff').multiplyScalar(2.5);
    portalMesh.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color })));
    portalMesh.add(new THREE.Mesh(new THREE.CircleGeometry(0.5, 32),
        new THREE.MeshBasicMaterial({ color: '#2b6cd4', transparent: true, opacity: 0.55, side: THREE.DoubleSide })));
    const light = new THREE.PointLight('#5aa9ff', 4, 5, 1.5);
    portalMesh.add(light);
    portalMesh.position.set(pos.x, 0.7, pos.z);
    scene.add(portalMesh);
}

function readReturnScroll() {
    if (!inventory.count('return_scroll')) return ui.showLabel('No Return Scrolls. Bram sells them.');
    if (depth === 0) {
        const z = outskirtsZones[0];
        if (z.contains(player.position)) return ui.showLabel('You are already in the village.');
        inventory.removeId('return_scroll');
        return travel(0, 'town');
    }
    inventory.removeId('return_scroll');
    portal = { depth, pos: { x: player.position.x, z: player.position.z } };
    travel(0, 'portal');
}

let stepOffTrigger = false;

// Stairs and portals: walking onto them moves you
function checkTriggers() {
    const tile = level.tileAtWorld(player.position.x, player.position.z);
    const onPortal = portalMesh && Math.hypot(portalMesh.position.x - player.position.x, portalMesh.position.z - player.position.z) < 0.5;
    const onTrigger = tile === '>' || tile === '<' || onPortal;
    if (stepOffTrigger) { stepOffTrigger = onTrigger; return; }
    if (tile === '>') travel(depth + 1, 'start');
    else if (tile === '<') travel(depth - 1, depth - 1 === 0 ? 'abbey-door' : 'below');
    else if (onPortal) travel(portal.depth, 'portal');
}

// --- Movement -------------------------------------------------------------------
const RADIUS = 0.22;
const BODY_GAP = 0.5; // player and NPCs keep at least this far apart
function blockedAt(x, z) {
    return level.isBlocked(x - RADIUS, z - RADIUS) || level.isBlocked(x + RADIUS, z - RADIUS)
        || level.isBlocked(x - RADIUS, z + RADIUS) || level.isBlocked(x + RADIUS, z + RADIUS);
}

const activeNpcs = () => (depth === 0 ? npcs : []);

// Would moving `obj` to (x, z) push it into the player or an NPC? Moving apart is always allowed.
function bumps(obj, x, z) {
    const people = activeNpcs();
    if (obj !== player && !people.includes(obj)) return false; // enemies are handled by their own AI
    for (const other of [player, ...people]) {
        if (other === obj) continue;
        const before = Math.hypot(obj.position.x - other.position.x, obj.position.z - other.position.z);
        const after = Math.hypot(x - other.position.x, z - other.position.z);
        if (after < BODY_GAP && after < before) return true;
    }
    return false;
}

// Move on each axis separately so you slide along walls instead of sticking
function tryMove(obj, dx, dz) {
    const p = obj.position;
    if (!blockedAt(p.x + dx, p.z) && !bumps(obj, p.x + dx, p.z)) p.x += dx;
    if (!blockedAt(p.x, p.z + dz) && !bumps(obj, p.x, p.z + dz)) p.z += dz;
}

// --- Talking --------------------------------------------------------------------
const TALK_RANGE = 1.6;

function nearestTalkable() {
    let best = null, bestDist = TALK_RANGE;
    for (const npc of activeNpcs()) {
        if (!npc.talkable) continue;
        const d = Math.hypot(npc.position.x - player.position.x, npc.position.z - player.position.z);
        if (d < bestDist) { best = npc; bestDist = d; }
    }
    return best;
}

function grantXp(n) {
    const levels = player.gainXp(n);
    if (levels) {
        player.setMaxHealth(maxHealth());
        player.health = player.maxHealth;
        ui.floatText(above(player, 2.0), `LEVEL ${player.level}!`, '#ffd700');
        ui.showLabel(`Level ${player.level}: +10 HP, +1 damage`);
        inventoryUI.render();
        save();
    }
}

function giveToPlayer(instOrId, n = 1) {
    const inst = typeof instOrId === 'string' ? { id: instOrId, count: n } : { count: 1, ...instOrId };
    if (inventory.add(inst) > 0) {
        dropOnGround('item', inst, player.position); // bag full: it lands at your feet
        ui.showLabel('Backpack full: dropped at your feet');
        return true;
    }
    const info = itemInfo(inst);
    ui.floatText(above(player, 1.6), `+${inst.count > 1 ? inst.count + ' ' : ''}${info.name}`, RARITY_COLORS[info.rarity]);
    return true;
}

function smithInventory() {
    // Plain stock improves with the deepest floor reached; four magic pieces rotate on every visit
    if (!smithStock) {
        const tier = Math.min(4, (flags.deepest ?? 0) + 1);
        const plain = Object.keys(ITEMS).filter(id => (ITEMS[id].damage || ITEMS[id].slot) && ITEMS[id].tier <= tier)
            .map(id => ({ id, count: 1 }));
        smithStock = [...plain, ...Array.from({ length: 4 }, () => rollEquipment(tier, 1))];
    }
    return smithStock;
}

function talkTo(npc) {
    const ctx = {
        player, inventory, quests, flags, lorePages,
        give: giveToPlayer,
        giveGold: (n) => { inventory.gold += n; inventory.changed(); ui.floatText(above(player, 1.9), `+${n} G`, '#ffd700'); },
        grantXp,
        healFull: () => {
            const amount = Math.ceil(player.maxHealth - player.health);
            player.heal(amount);
            ui.floatText(above(player, 1.6), `+${amount}`, '#2ecc71');
        },
        boostMaxHp: (n) => { flags.vigor = (flags.vigor ?? 0) + n; refreshGear(); ui.showLabel(`Max HP +${n}`); },
        openShop: (kind) => (kind === 'smith'
            ? shop.open("HILDA'S FORGE", smithInventory())
            : shop.open("BRAM'S GOODS", [{ id: 'potion', count: 1 }, { id: 'return_scroll', count: 1 }])),
    };
    dialogue.start(npc, npc.def.talk(ctx));
}

// Menus that freeze the game while they're open
const busy = () => dialogue.isOpen || shop.isOpen || !started;

// --- Input ----------------------------------------------------------------------
let mouseHeld = false;

window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') e.preventDefault();
    if (e.repeat || !player || !started) return;
    if (k === ' ') {
        if (dialogue.isOpen) dialogue.advance();
        else if (!shop.isOpen && !player.dead) {
            const npc = nearestTalkable();
            if (npc) talkTo(npc);
        }
    } else if (k === 'escape') {
        dialogue.close(); shop.close(); inventoryUI.close(); questUI.close();
    } else if (busy()) {
        return;
    } else if (k >= '1' && k <= '5') inventory.select(Number(k) - 1);
    else if (k === 'e' || k === 'i') inventoryUI.toggle();
    else if (k === 'q') questUI.toggle();
    else if (k === 't' && !player.dead) readReturnScroll();
    else if (k === 'r' && player.dead && player.sprite.done) respawn();
    else if (k === 'f') {
        effectsOn = !effectsOn;
        document.getElementById('fx-state').textContent = effectsOn ? 'on' : 'off';
    }
});
window.addEventListener('wheel', (e) => {
    if (!inventoryUI.isOpen && !busy()) inventory.select(inventory.selected + Math.sign(e.deltaY));
}, { passive: true });

// Only clicks on the game itself use items — clicks on the hotbar/backpack don't swing the sword
renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || busy()) return;
    mouseHeld = true;
    useSelectedItem();
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

function useSelectedItem() {
    const item = inventory.selectedItem;
    if (!item || player.dead) return;
    if (item.damage) {
        player.tryAttack();
    } else if (item.heal) {
        if (player.health >= player.maxHealth) return ui.showLabel('Already at full health');
        player.heal(item.heal);
        inventory.consumeSelected();
        ui.floatText(above(player, 1.6), `+${item.heal}`, '#2ecc71');
    } else if (item.use === 'return') {
        readReturnScroll();
    } else if (item.slot) {
        ui.showLabel(`Open the backpack (E) to wear ${item.name}`);
    } else {
        ui.showLabel(`${item.name}: sell it to Bram`);
    }
}

// --- Loot, death and pickups ----------------------------------------------------
function dropLoot(enemy) {
    const { gold: [lo, hi], items, equip, unique } = enemy.def.loot;
    const pos = { x: enemy.position.x, z: enemy.position.z };
    dropOnGround('gold', Math.round((lo + Math.random() * (hi - lo)) * enemy.power), pos);
    for (const [id, n, chance] of items) if (Math.random() < chance) dropOnGround('item', { id, count: n }, pos);
    const tier = Math.max(1, depth);
    if (Math.random() < equip) dropOnGround('item', rollEquipment(tier), pos);
    if (unique) {
        dropOnGround('item', { id: unique, count: 1 }, pos);
        dropOnGround('item', rollEquipment(tier, 1), pos);
    }
}

function onEnemyKilled(enemy) {
    dropLoot(enemy);
    grantXp(enemy.xp);
    if (enemy.type === 'gravewarden' || enemy.type === 'goblin_chieftain') {
        flags.bossDead = { ...flags.bossDead, [depth]: true };
        syncQuests();
        ui.showZone(`${enemy.def.name} has fallen`, 'Return to the village with the news');
    }
    if (enemy.type === 'alpha_wolf') {
        flags.alphaDead = true;
        syncQuests();
    }
    save();
}

function pickUp(g) {
    if (g.kind === 'gold') {
        inventory.gold += g.payload;
        inventory.changed();
        ui.floatText(above(player, 1.6), `+${g.payload} G`, '#ffd700');
    } else if (g.kind === 'lore') {
        flags.lore = { ...flags.lore, [g.payload]: true };
        grantXp(25);
        dialogue.start(null, {
            name: 'Abbot Varric\'s Journal', title: `Page ${g.payload} of 4`,
            lines: [...LORE[g.payload], lorePages() >= 4 ? '(You have every page. Take them to Old Tomas.)' : '(Old Tomas will want to see this.)'],
        });
    } else {
        if (!inventory.hasRoomFor(g.payload)) {
            if (!g.warned) ui.showLabel('Backpack full');
            g.warned = true;
            return false;
        }
        inventory.add(g.payload);
        const info = itemInfo(g.payload);
        ui.floatText(above(player, 1.6), info.name, RARITY_COLORS[info.rarity]);
        if (g.payload.id === 'aldrens_signet') {
            flags.signetFound = true;
            syncQuests();
        }
    }
    return true;
}

async function respawn() {
    const lost = Math.floor(inventory.gold / 2);
    inventory.gold -= lost;
    inventory.changed();
    player.revive();
    ui.showGameOver(false);
    portal = null;
    await travel(0, 'town');
    ui.showLabel(lost ? `You lost ${lost} gold.` : 'You wake in Willowbrook.');
}

// --- Update ---------------------------------------------------------------------
let autosaveTimer = 0;

function update(dt, t) {
    const frozen = busy() || transitioning;
    const input = frozen ? { x: 0, z: 0, run: false } : {
        x: (keys.d ? 1 : 0) - (keys.a ? 1 : 0),
        z: (keys.s ? 1 : 0) - (keys.w ? 1 : 0),
        run: keys.shift,
    };
    if (mouseHeld && !frozen) player.tryAttack(); // hold to keep swinging
    player.update(dt, input, tryMove, camera);

    // Weapon connects: hit every enemy near the point in front of the player
    if (player.swingHit) {
        player.swingHit = false;
        const hit = player.attackPoint();
        const damage = attackPower();
        for (const s of enemies) {
            const reach = s.def.boss ? 1.1 : 0.8;
            if (Math.hypot(s.position.x - hit.x, s.position.z - hit.z) < reach && s.takeDamage(damage, player.position)) {
                ui.floatText(above(s, s.def.barY + 0.2), `-${damage}`, '#ff4757');
            }
        }
    }

    // Enemies wait while you're in a menu, and won't follow you into safe areas
    const zone = depth === 0 ? outskirtsZones.find(z => z.contains(player.position)) : zones[0];
    const canChase = !zone?.safe;
    for (const s of frozen ? [] : enemies) {
        s.update(dt, player, tryMove, camera, canChase);
        if (s.hitPlayer) {
            s.hitPlayer = false;
            const taken = player.takeDamage(s.damage);
            if (taken) ui.floatText(above(player, 1.6), `-${taken}`, '#f1c40f');
        }
    }

    enemies = enemies.filter(s => {
        if (s.state === 'dying' && !s.looted) {
            s.looted = true; // pay out as it falls, not after the fade
            onEnemyKilled(s);
        }
        if (s.state !== 'dead') return true;
        scene.remove(s.mesh);
        return false;
    });

    // Loot on the ground
    for (const g of ground) g.update(t, camera);
    if (!frozen && !player.dead) {
        ground = ground.filter(g => {
            if (Math.hypot(g.position.x - player.position.x, g.position.z - player.position.z) > PICKUP_RANGE) return true;
            if (!pickUp(g)) return true;
            g.dispose();
            return false;
        });
    }

    if (depth === 0 && !frozen) {
        // Outskirts zones refill slowly, out of sight
        for (const z of outskirtsZones) {
            if (!z.enemies || aliveIn(z) >= z.max || (z.respawnTimer += dt) < RESPAWN_SECONDS) continue;
            z.respawnTimer = 0;
            const pos = z.spawnPoint(player.position, SPAWN_MIN_DIST);
            if (pos) spawnEnemy(z.pickEnemy(), pos, z);
        }
        // Wren's quest target appears once the hunt is on
        if (quests.is('alpha', 'active') && !flags.alphaDead && !enemies.some(e => e.type === 'alpha_wolf')) {
            const den = outskirts.tileToWorld(ALPHA_DEN.col, ALPHA_DEN.row);
            if (Math.hypot(den.x - player.position.x, den.z - player.position.z) > 10) {
                spawnEnemy('alpha_wolf', den, outskirtsZones.find(z => z.name === 'Whisperwood'));
            }
        }
        npcs.forEach(n => n.update(dt, player, tryMove, camera));
    }

    if (!frozen && !player.dead) checkTriggers();
    level.explore(player.position);

    if (zone !== currentZone) {
        currentZone = zone;
        if (zone && depth === 0) ui.showZone(zone.name, zone.subtitle ?? 'Danger');
    }

    const talkable = !frozen && !player.dead && nearestTalkable();
    ui.setPrompt(talkable ? above(talkable, 1.75) : null);
    const markerCtx = { quests, flags, lorePages };
    ui.updateMarkers(activeNpcs().map(n => {
        const symbol = n.def.marker?.(markerCtx);
        return symbol ? { pos: above(n, 2.05), symbol } : null;
    }).filter(Boolean), camera);

    const boss = enemies.find(e => e.def.boss && e.state !== 'dead'
        && Math.hypot(e.position.x - player.position.x, e.position.z - player.position.z) < 12);
    ui.setBoss(boss ?? null);

    minimap.draw(player, enemies, activeNpcs(), [
        ...ground.filter(g => g.kind !== 'gold').map(g => ({ pos: g.position, color: g.kind === 'lore' ? '#c9a0ff' : '#6fa8ff' })),
    ]);
    ui.setBars(player);
    ui.showGameOver(player.dead && player.sprite.done);

    if ((autosaveTimer += dt) > 30) { autosaveTimer = 0; save(); }
}

// --- Starting a game ------------------------------------------------------------
npcs = NPC_DEFS.map(def => {
    const p = outskirts.tileToWorld(...def.tile);
    return new NPC(def, p.x, p.z, (c, r) => outskirts.tileToWorld(c, r));
});

async function beginGame(saved) {
    document.getElementById('title').classList.add('hidden');
    document.getElementById('ui').classList.remove('hidden'); // HUD stays hidden behind the title screen
    flags = {};
    quests.load(saved?.quests ?? {});
    inventory.reset();
    if (saved) {
        inventory.load(saved.inventory);
        flags = saved.flags ?? {};
        portal = saved.portal ?? null;
    } else {
        inventory.slots[0] = { id: 'sword', count: 1 }; // in hand, not in the backpack
        inventory.add('potion', 3);
        inventory.equipment.body = { id: 'peasant_clothes', count: 1 };
        inventory.gold = STARTING_GOLD;
    }
    const sheet = await loadPlayerSheet(playerLayers(inventory.gear));
    player = new Player(0, 0, sheet);
    if (saved) { player.level = saved.player.level; player.xp = saved.player.xp; }
    scene.add(player.mesh);
    refreshGear();
    player.health = player.maxHealth;

    started = true;
    await travel(0, saved ? 'town' : 'start');
    if (!saved) {
        dialogue.start(null, { name: '', title: '', lines: INTRO, then: () => ui.showLabel('Find someone in the village. Space to talk.') });
    }
}

// Title screen: the village renders behind it while you choose
const existing = loadSave();
const continueBtn = document.getElementById('btn-continue');
continueBtn.classList.toggle('hidden', !existing);
continueBtn.addEventListener('click', () => beginGame(existing));
document.getElementById('btn-new').addEventListener('click', () => {
    if (existing && !confirm('Start a new game? Your saved progress will be erased.')) return;
    clearSave();
    beginGame(null);
});

level = outskirts;
scene.add(outskirts.group);
npcs.forEach(n => scene.add(n.mesh));
setOutdoorLighting();
minimap.setLevel(level);
const titleCam = outskirts.tileToWorld(32, 38);
camera.position.set(titleCam.x, 0, titleCam.z).add(CAMERA_OFFSET);
camera.lookAt(titleCam.x, 0.6, titleCam.z + 0.5);

// --- Main loop ------------------------------------------------------------------
const camTarget = new THREE.Vector3();
let last = performance.now();

function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const t = now / 1000;
    timeUniform.value = t;
    level.update(t);

    if (player && started) {
        update(dt, t);
        // Smooth follow camera
        camTarget.copy(player.position).add(CAMERA_OFFSET);
        camera.position.lerp(camTarget, 1 - Math.exp(-dt * 5));
        camera.lookAt(player.position.x, player.position.y + 0.6, player.position.z + 0.5);
        lantern.position.set(player.position.x, 1.6, player.position.z + 0.4);
    } else {
        // Title screen: villagers go about their day
        const idle = { position: new THREE.Vector3(1e4, 0, 1e4), dead: false };
        npcs.forEach(n => n.update(dt, idle, () => {}, camera));
    }

    const focus = player && started ? player.position : camera.position.clone().sub(CAMERA_OFFSET);
    sun.position.copy(focus).add(SUN_OFFSET);
    sun.target.position.copy(focus);
    if (portalMesh) portalMesh.rotation.y = t * 0.8;
    fireflies.position.set(focus.x, 0, focus.z);
    fireflyBase.forEach((f, i) => {
        fireflyPos[i * 3] = f.x + Math.sin(t * 0.4 + f.p) * 0.8;
        fireflyPos[i * 3 + 1] = f.y + Math.sin(t * 1.3 + f.p * 2) * 0.25;
        fireflyPos[i * 3 + 2] = f.z + Math.cos(t * 0.35 + f.p) * 0.8;
    });
    fireflyGeo.attributes.position.needsUpdate = true;

    ui.updateFloats(dt, camera);
    ui.updatePrompt(camera);
    if (effectsOn) composer.render();
    else renderer.render(scene, camera);
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
