import * as THREE from 'three';
import { Billboard, loadSheet } from './Billboard.js';

const COLORS = ['Blue', 'Green', 'Orange', 'Pink', 'Purple'];

export function loadSlimeSheets() {
    return Promise.all(COLORS.map(c => loadSheet(`slime_${c}`, [`assets/sprites/slime/Slime_${c}.png`])));
}

// Sheet rows: 0 down, 1 left, 2 right, 3 up
const ROW = { down: 0, up: 3, left: 1, right: 2 };
// Sheet columns: 0-2 wobble, 3 rear up, 4 stretch forward, 7 squashed flat
const HIT_FRAME = 2;   // index in the attack's frame list where the slime lands on you
const CHASE_RANGE = 5;
const ATTACK_RANGE = 0.9;

export class Slime {
    constructor(x, z, color = COLORS[Math.floor(Math.random() * COLORS.length)]) {
        const sheet = `slime_${color}`;
        this.sprite = new Billboard({
            idle:   { sheet, frames: [0, 1, 2, 1], speed: 0.2 },
            walk:   { sheet, frames: [1, 4, 2, 4], speed: 0.15 },
            run:    { sheet, frames: [1, 4, 2, 4], speed: 0.1 },
            attack: { sheet, frames: [0, 3, 3, 3, 0], speed: 0.1, loop: false },
            hurt:   { sheet, frames: [7, 0], speed: 0.15, loop: false },
            death:  { sheet, frames: [7, 7, 7, 7], speed: 0.12, loop: false },
        }, { ppu: 72, feetPx: 123 });
        this.mesh = this.sprite.mesh;
        this.mesh.position.set(x, 0, z);

        this.maxHealth = 30; this.health = 30;
        this.damage = 10;
        this.state = 'move'; // move | attack | hurt | dying | dead
        this.dir = new THREE.Vector2();
        this.knock = new THREE.Vector2();
        this.wanderTimer = Math.random() * 2;
        this.attackCooldown = 0;
        this.hitDone = false;
        this.hitPlayer = false; // set on the frame the attack lands; main.js consumes it
        this.buildHealthBar();
    }

    get position() { return this.mesh.position; }

    // Small bar above the head, only shown once the slime has been hit
    buildHealthBar() {
        const W = 0.7;
        const onTop = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false });
        this.bar = new THREE.Group();
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.04, 0.1), onTop('#111'));
        this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.06).translate(W / 2, 0, 0), onTop('#2ecc71'));
        this.barFill.position.x = -W / 2;
        bg.renderOrder = 20;
        this.barFill.renderOrder = 21;
        this.bar.add(bg, this.barFill);
        this.bar.position.y = 0.72;
        this.bar.visible = false;
        this.mesh.add(this.bar);
    }

    face(dx, dz) {
        this.sprite.row = Math.abs(dx) > Math.abs(dz)
            ? (dx < 0 ? ROW.left : ROW.right)
            : (dz < 0 ? ROW.up : ROW.down);
    }

    takeDamage(amount, from) {
        if (this.state === 'hurt' || this.state === 'dying' || this.state === 'dead') return false;
        this.health = Math.max(0, this.health - amount);
        this.barFill.scale.x = this.health / this.maxHealth;
        this.bar.visible = this.health > 0;
        if (this.health <= 0) {
            this.state = 'dying';
            this.sprite.play('death', true);
        } else {
            this.state = 'hurt';
            this.sprite.play('hurt', true);
            this.knock.set(this.position.x - from.x, this.position.z - from.z).setLength(4);
        }
        return true;
    }

    update(dt, player, tryMove, camera) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const dist = Math.hypot(dx, dz);

        switch (this.state) {
            case 'dying':
                if (this.sprite.done) this.state = 'dead';
                break;
            case 'hurt':
                tryMove(this, this.knock.x * dt, this.knock.y * dt);
                this.knock.multiplyScalar(Math.exp(-10 * dt));
                if (this.sprite.done) this.state = 'move';
                break;
            case 'attack':
                if (!this.hitDone && this.sprite.frame >= HIT_FRAME) {
                    this.hitDone = true;
                    if (dist < ATTACK_RANGE + 0.2 && !player.dead) this.hitPlayer = true;
                }
                if (this.sprite.done) {
                    this.state = 'move';
                    this.attackCooldown = 1.0;
                }
                break;
            default:
                if (!player.dead && dist < ATTACK_RANGE && this.attackCooldown <= 0) {
                    this.state = 'attack';
                    this.hitDone = false;
                    this.face(dx, dz);
                    this.sprite.play('attack', true);
                } else if (!player.dead && dist < CHASE_RANGE) {
                    this.face(dx, dz);
                    this.sprite.play('run');
                    if (dist > ATTACK_RANGE * 0.8) tryMove(this, (dx / dist) * 1.4 * dt, (dz / dist) * 1.4 * dt);
                } else {
                    this.wander(dt, tryMove);
                }
        }
        this.sprite.update(dt, camera);
    }

    wander(dt, tryMove) {
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
            this.wanderTimer = 1.5 + Math.random() * 2.5;
            const a = Math.random() * Math.PI * 2;
            // Often stand still; otherwise pick a mostly-cardinal direction
            this.dir.set(Math.random() < 0.4 ? 0 : Math.cos(a), Math.random() < 0.4 ? 0 : Math.sin(a));
        }
        if (this.dir.lengthSq() === 0) {
            this.sprite.play('idle');
            return;
        }
        this.face(this.dir.x, this.dir.y);
        this.sprite.play('walk');
        tryMove(this, this.dir.x * 0.6 * dt, this.dir.y * 0.6 * dt);
    }
}
