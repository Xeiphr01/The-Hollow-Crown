import * as THREE from 'three';
import { Billboard, loadSheet } from './Billboard.js';

// Layers from the sprite pack, stacked bottom to top. Swap these to change the outfit.
const SPRITES = 'assets/sprites/';
const BODY = [
    `${SPRITES}humanoid/Template_Male.png`,
    `${SPRITES}armor/Adventurer_01_Adventurer_Male.png`,
    `${SPRITES}hair/SpikyBrown.png`,
];
const SWORD = `${SPRITES}weapons/Sword_01_Arming_Male.png`;

export function loadPlayerSheets() {
    return Promise.all([
        loadSheet('player_unarmed', BODY),
        loadSheet('player_sword', [...BODY, SWORD]),
    ]);
}

// Sheet rows: 0 down, 1 left, 2 right, 3 up → facing direction on the ground (x, z)
const DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]];
// Sheet columns: 0 stand, 1-2 walk steps, 3 wind-up, 4 swing, 5-6 cast, 7 kneel
const WALK = [1, 0, 2, 0];
const HIT_FRAME = 2; // index in the attack's frame list where the swing (column 4) lands
const RUN_RECOVER_AT = 0.3; // after emptying stamina, running unlocks again at 30%
const INVULNERABLE_SECONDS = 1.0; // after being hit, so several slimes can't stun-lock you

export class Player {
    constructor(x, z) {
        const anims = {};
        for (const weapon of ['unarmed', 'sword']) {
            const sheet = `player_${weapon}`;
            anims[`${weapon}_idle`] = { sheet, frames: [0], speed: 1 };
            anims[`${weapon}_walk`] = { sheet, frames: WALK, speed: 0.16 };
            anims[`${weapon}_run`] = { sheet, frames: WALK, speed: 0.1 };
        }
        anims.sword_attack = { sheet: 'player_sword', frames: [3, 3, 4, 4, 4], speed: 0.07, loop: false };
        anims.hurt = { sheet: 'player_unarmed', frames: [7, 7, 7], speed: 0.12, loop: false };
        anims.death = { sheet: 'player_unarmed', frames: [7, 7, 7, 7], speed: 0.15, loop: false };
        this.sprite = new Billboard(anims, { ppu: 72, feetPx: 123, silhouette: true });
        this.mesh = this.sprite.mesh;
        this.mesh.position.set(x, 0, z);

        this.maxHealth = 100; this.health = 100;
        this.maxStamina = 100; this.stamina = 100;
        this.exhausted = false; // stamina hit 0: no running until it recharges to RUN_RECOVER_AT
        this.walkSpeed = 3; this.runSpeed = 5;
        this.weapon = 'unarmed';
        this.state = 'move'; // move | attack | hurt | dead
        this.attackCooldown = 0;
        this.invulnerable = 0;
        this.swingHit = false; // true on the one frame the sword connects; main.js consumes it
        this.hitDone = false;
    }

    get position() { return this.mesh.position; }
    get dead() { return this.state === 'dead'; }

    // Centre of the sword swing, in front of the player
    attackPoint(reach = 0.7) {
        const [dx, dz] = DIRS[this.sprite.row];
        return new THREE.Vector3(this.position.x + dx * reach, 0, this.position.z + dz * reach);
    }

    tryAttack() {
        if (this.state !== 'move' || this.weapon !== 'sword' || this.attackCooldown > 0 || this.stamina < 15) return false;
        this.state = 'attack';
        this.stamina -= 15;
        this.attackCooldown = 0.6;
        this.hitDone = false;
        this.sprite.play('sword_attack', true);
        return true;
    }

    takeDamage(amount) {
        if (this.invulnerable > 0 || this.state === 'dead') return false;
        this.health = Math.max(0, this.health - amount);
        this.invulnerable = INVULNERABLE_SECONDS;
        this.state = this.health <= 0 ? 'dead' : 'hurt';
        this.sprite.play(this.state === 'dead' ? 'death' : 'hurt', true);
        return true;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    /** @param input { x, z, run } — movement axes from the keyboard */
    update(dt, input, tryMove, camera) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        if (this.invulnerable > 0) this.invulnerable -= dt;
        // Blink while invulnerable
        this.mesh.visible = this.dead || this.invulnerable <= 0 || Math.floor(this.invulnerable * 12) % 2 === 0;

        if (this.state === 'attack') {
            if (!this.hitDone && this.sprite.frame >= HIT_FRAME) {
                this.hitDone = true;
                this.swingHit = true;
            }
            if (this.sprite.done) this.state = 'move';
        } else if (this.state === 'hurt' && this.sprite.done) {
            this.state = 'move';
        }

        let running = false;
        if (this.state === 'move') {
            const move = new THREE.Vector2(input.x, input.z);
            if (move.lengthSq() > 0) {
                move.normalize();
                running = input.run && !this.exhausted;
                const speed = running ? this.runSpeed : this.walkSpeed;
                this.sprite.row = Math.abs(move.x) > Math.abs(move.y)
                    ? (move.x < 0 ? 1 : 2)
                    : (move.y < 0 ? 3 : 0);
                this.sprite.play(`${this.weapon}_${running ? 'run' : 'walk'}`);
                tryMove(this, move.x * speed * dt, move.y * speed * dt);
            } else {
                this.sprite.play(`${this.weapon}_idle`);
            }
        }

        if (running) this.stamina = Math.max(0, this.stamina - 20 * dt);
        else if (this.state === 'move') this.stamina = Math.min(this.maxStamina, this.stamina + 25 * dt);
        // Without this lock, stamina hovered near 0 and the sprite flickered between run and walk
        if (this.stamina <= 0) this.exhausted = true;
        else if (this.stamina >= this.maxStamina * RUN_RECOVER_AT) this.exhausted = false;

        this.sprite.update(dt, camera);
    }
}
