import * as THREE from 'three';

// HUD overlay: health/stamina bars, item name label, floating combat text, game-over screen.
// The elements live in hd2d.html; this module just updates them.

const $ = (id) => document.getElementById(id);

export function setBars(player) {
    $('hp-fill').style.width = `${(player.health / player.maxHealth) * 100}%`;
    $('hp-text').textContent = `${Math.ceil(player.health)} / ${player.maxHealth}`;
    $('xp-fill').style.width = `${(player.xp / player.xpToNext) * 100}%`;
    $('level').textContent = player.level;
    $('sp-fill').style.width = `${(player.stamina / player.maxStamina) * 100}%`;
    $('sp-fill').classList.toggle('exhausted', player.exhausted);
}

export function showGameOver(on) {
    $('game-over').classList.toggle('hidden', !on);
}

let labelTimer;
export function showLabel(text) {
    const el = $('item-label');
    el.textContent = text;
    el.style.opacity = 1;
    clearTimeout(labelTimer);
    labelTimer = setTimeout(() => { el.style.opacity = 0; }, 1500);
}

// Text that floats up from a point in the world (damage numbers, pickups)
const floats = [];
const projected = new THREE.Vector3();

export function floatText(worldPos, text, color = '#fff') {
    const el = document.createElement('div');
    el.className = 'float-text';
    el.textContent = text;
    el.style.color = color;
    $('float-layer').appendChild(el);
    floats.push({ el, pos: worldPos.clone(), life: 1 });
}

export function updateFloats(dt, camera) {
    for (let i = floats.length - 1; i >= 0; i--) {
        const f = floats[i];
        f.life -= dt;
        f.pos.y += 0.8 * dt;
        if (f.life <= 0) {
            f.el.remove();
            floats.splice(i, 1);
            continue;
        }
        projected.copy(f.pos).project(camera);
        const x = (projected.x + 1) / 2 * window.innerWidth;
        const y = (1 - projected.y) / 2 * window.innerHeight;
        f.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        f.el.style.opacity = Math.min(1, f.life * 2);
    }
}

// "Space · Talk" bubble over the nearest NPC; pass null to hide it
let promptPos = null;
export function setPrompt(worldPos) {
    promptPos = worldPos;
    $('prompt').classList.toggle('hidden', !worldPos);
}

export function updatePrompt(camera) {
    if (!promptPos) return;
    projected.copy(promptPos).project(camera);
    const x = (projected.x + 1) / 2 * window.innerWidth;
    const y = (1 - projected.y) / 2 * window.innerHeight;
    $('prompt').style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
}

// Big area name across the top when you walk into a new region
let zoneTimer;
export function showZone(name, subtitle) {
    const el = $('zone-banner');
    el.innerHTML = `<div class="zone-name">${name}</div><div class="zone-sub">${subtitle}</div>`;
    el.classList.add('show');
    clearTimeout(zoneTimer);
    zoneTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

export function setLocation(text) {
    $('location').textContent = text;
}

// Boss health bar across the top of the screen; pass null to hide
export function setBoss(enemy) {
    $('boss-bar').classList.toggle('hidden', !enemy);
    if (!enemy) return;
    $('boss-name').textContent = enemy.def.name;
    $('boss-fill').style.width = `${(enemy.health / enemy.maxHealth) * 100}%`;
}

// Quest markers ('!' / '?') floating over NPCs, repositioned every frame
const markerEls = [];
export function updateMarkers(list, camera) {
    while (markerEls.length < list.length) {
        const el = document.createElement('div');
        el.className = 'quest-marker';
        $('float-layer').appendChild(el);
        markerEls.push(el);
    }
    markerEls.forEach((el, i) => {
        const m = list[i];
        el.classList.toggle('hidden', !m);
        if (!m) return;
        el.textContent = m.symbol;
        el.classList.toggle('ready', m.symbol === '?');
        projected.copy(m.pos).project(camera);
        const x = (projected.x + 1) / 2 * window.innerWidth;
        const y = (1 - projected.y) / 2 * window.innerHeight;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    });
}

// Fade the screen to black and back (level transitions); resolves when the fade finishes
export function fade(toBlack) {
    $('fade').classList.toggle('on', toBlack);
    return new Promise(resolve => setTimeout(resolve, 350));
}
