import * as THREE from 'three';

// HUD overlay: health/stamina bars, item name label, floating combat text, game-over screen.
// The elements live in hd2d.html; this module just updates them.

const $ = (id) => document.getElementById(id);

export function setBars(player) {
    $('hp-fill').style.width = `${(player.health / player.maxHealth) * 100}%`;
    $('hp-text').textContent = `${Math.ceil(player.health)} / ${player.maxHealth}`;
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
