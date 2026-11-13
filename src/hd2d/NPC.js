import * as THREE from 'three';
import { Billboard, loadSheet, sheetCanvas } from './Billboard.js';

// Townsfolk and animals. Behaviour comes from the definition in npcs.js:
//   stand  — stays put, turns to face you when you're close
//   wander — strolls around its home spot within `radius`
//   patrol — walks back and forth between waypoints, pausing at each

const HUMAN_ROWS = { down: 0, left: 1, right: 2, up: 3 };
const NOTICE_RANGE = 2.2; // talkable NPCs stop and look at you inside this distance

const sheetKey = (def) => `npc_${def.sprite ?? def.id}`;

export function loadNpcSheets(defs) {
    const unique = new Map(defs.map(d => [sheetKey(d), d.layers]));
    return Promise.all([...unique].map(([key, layers]) => loadSheet(key, layers)));
}

export class NPC {
    /** @param toWorld (col, row) → { x, z }, for converting patrol waypoints */
    constructor(def, x, z, toWorld) {
        this.def = def;
        this.waypoints = def.waypoints?.map(([c, r]) => toWorld(c, r));
        this.rows = def.rows ?? HUMAN_ROWS;
        const sheet = sheetKey(def);
        this.sprite = new Billboard({
            idle: { sheet, frames: [0], speed: 1 },
            walk: { sheet, frames: [1, 0, 2, 0], speed: def.stepSpeed ?? 0.18 },
        }, { ppu: 72, feetPx: def.feetPx ?? 123 });
        this.mesh = this.sprite.mesh;
        this.mesh.position.set(x, 0, z);

        this.home = new THREE.Vector2(x, z);
        this.speed = def.speed ?? 1;
        this.dir = new THREE.Vector2();
        this.timer = Math.random() * 2;
        this.waypoint = 0;
        this.talking = false;
        this.face(def.facing ?? 'down');
    }

    get position() { return this.mesh.position; }
    get name() { return this.def.name; }
    get talkable() { return Boolean(this.def.talk); }

    face(dir) { this.sprite.row = this.rows[dir]; }

    faceToward(dx, dz) {
        this.face(Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 'left' : 'right') : (dz < 0 ? 'up' : 'down'));
    }

    update(dt, player, tryMove, camera) {
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const near = this.talkable && !player.dead && Math.hypot(dx, dz) < NOTICE_RANGE;

        if (this.talking || near) {
            this.faceToward(dx, dz);
            this.sprite.play('idle');
        } else if (this.def.behavior === 'patrol') {
            this.patrol(dt, tryMove);
        } else if (this.def.behavior === 'wander') {
            this.wander(dt, tryMove);
        } else {
            this.sprite.play('idle');
        }
        this.sprite.update(dt, camera);
    }

    walk(dx, dz, dt, tryMove) {
        const len = Math.hypot(dx, dz);
        this.faceToward(dx, dz);
        this.sprite.play('walk');
        tryMove(this, (dx / len) * this.speed * dt, (dz / len) * this.speed * dt);
    }

    wander(dt, tryMove) {
        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 1 + Math.random() * 2.5;
            const fromHome = new THREE.Vector2(this.position.x, this.position.z).sub(this.home);
            if (fromHome.length() > (this.def.radius ?? 2)) {
                this.dir.copy(fromHome).negate().normalize(); // wandered too far: head back
            } else if (Math.random() < 0.45) {
                this.dir.set(0, 0); // pause
            } else {
                const a = Math.floor(Math.random() * 4) * Math.PI / 2;
                this.dir.set(Math.round(Math.cos(a)), Math.round(Math.sin(a)));
            }
        }
        if (this.dir.lengthSq() === 0) this.sprite.play('idle');
        else this.walk(this.dir.x, this.dir.y, dt, tryMove);
    }

    patrol(dt, tryMove) {
        if (this.timer > 0) {
            this.timer -= dt;
            this.sprite.play('idle');
            return;
        }
        const target = this.waypoints[this.waypoint];
        const dx = target.x - this.position.x;
        const dz = target.z - this.position.z;
        if (Math.hypot(dx, dz) < 0.1) {
            this.waypoint = (this.waypoint + 1) % this.waypoints.length;
            this.timer = 2; // look around before heading off again
            return;
        }
        this.walk(dx, dz, dt, tryMove);
    }

    // Head-and-shoulders crop of the standing front frame, for the dialogue box
    portrait(size = 88) {
        const src = sheetCanvas(sheetKey(this.def));
        const g = src.getContext('2d');
        const alpha = g.getImageData(0, 0, 128, 128).data;
        let top = 0;
        while (top < 127 && ![...Array(128).keys()].some(x => alpha[(top * 128 + x) * 4 + 3] > 0)) top++;

        const out = document.createElement('canvas');
        out.width = out.height = size;
        const og = out.getContext('2d');
        og.imageSmoothingEnabled = false;
        const crop = 44;
        og.drawImage(src, 64 - crop / 2, Math.max(0, top - 3), crop, crop, 0, 0, size, size);
        return out;
    }
}
