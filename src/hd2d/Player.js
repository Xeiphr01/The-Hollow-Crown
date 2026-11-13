import * as THREE from 'three';
import { Billboard, loadSheet, hasSheet } from './Billboard.js';

// The player's look is a stack of sprite-pack layers: body and hair, then whatever is worn
// (outfit, helmet, shield) and held (the hotbar item). Each combination is composited once.
const SPRITES = 'assets/sprites/';
const BODY = `${SPRITES}humanoid/Template_Male.png`;
const UNDERWEAR = `${SPRITES}humanoid/Underwear_male.png`; // always worn, so taking the outfit off stays decent
const HAIR = `${SPRITES}hair/SpikyBrown.png`;

/** @param gear { body, head, offhand, held } — item definitions or null */
export function playerLayers(gear) {
    return [BODY, UNDERWEAR, gear.body?.layer, HAIR, gear.head?.layer, gear.offhand?.layer, gear.held?.layer].filter(Boolean);
}

export async function loadPlayerSheet(layers) {
    const key = layers.join('|');
    if (!hasSheet(key)) await loadSheet(key, layers);
    return key;
}

// Sheet rows: 0 down, 1 left, 2 right, 3 up → facing direction on the ground (x, z)
const DIRS = [[0, 1], [-1, 0], [1, 0], [0, -1]];
// Sheet columns: 0 stand, 1-2 walk steps, 3 wind-up, 4 swing, 5-6 cast, 7 kneel
const WALK = [1, 0, 2, 0];
const HIT_FRAME = 2; // index in the attack's frame list where the swing (column 4) lands
const RUN_RECOVER_AT = 0.3; // after emptying stamina, running unlocks again at 30%
const INVULNERABLE_SECONDS = 1.0; // after being hit, so several slimes can't stun-lock you

export class Player {
    constructor(x, z, sheet) {
        this.sprite = new Billboard({
            idle:   { sheet, frames: [0], speed: 1 },
            walk:   { sheet, frames: WALK, speed: 0.16 },
            run:    { sheet, frames: WALK, speed: 0.1 },
            attack: { sheet, frames: [3, 3, 4, 4, 4], speed: 0.07, loop: false },
            hurt:   { sheet, frames: [7, 7, 7], speed: 0.12, loop: false },
            death:  { sheet, frames: [7, 7, 7, 7], speed: 0.15, loop: false },
        }, { ppu: 72, feetPx: 123, silhouette: true });
        this.mesh = this.sprite.mesh;
        this.mesh.position.set(x, 0, z);

        this.maxHealth = 100; this.health = 100;
        this.level = 1; this.xp = 0;
        this.maxStamina = 100; this.stamina = 100;
        this.exhausted = false; // stamina hit 0: no running until it recharges to RUN_RECOVER_AT
        this.walkSpeed = 3; this.runSpeed = 5;
        this.weapon = null;   // held item definition, if it can be swung (has `damage`)
        this.defense = 0;     // total from worn gear
        this.appearance = ''; // sheet key currently shown (or being loaded)
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

    // Swap to the sheet for the current gear; ignores results that arrive after a newer change
    async setAppearance(layers) {
        const key = layers.join('|');
        if (key === this.appearance) return;
        this.appearance = key;
        await loadPlayerSheet(layers);
        if (this.appearance === key) this.sprite.setSheet(key);
    }

    tryAttack() {
        if (this.state !== 'move' || !this.weapon || this.attackCooldown > 0 || this.stamina < 15) return false;
        this.state = 'attack';
        this.stamina -= 15;
        this.attackCooldown = this.weapon.cooldown;
        this.hitDone = false;
        this.sprite.play('attack', true);
        return true;
    }

    // Defense scales damage down smoothly: 10 defense halves it. Returns damage taken, or 0 if ignored.
    takeDamage(amount) {
        if (this.invulnerable > 0 || this.state === 'dead') return 0;
        amount = Math.max(1, Math.round(amount * 10 / (10 + this.defense)));
        this.health = Math.max(0, this.health - amount);
        this.invulnerable = INVULNERABLE_SECONDS;
        this.state = this.health <= 0 ? 'dead' : 'hurt';
        this.sprite.play(this.state === 'dead' ? 'death' : 'hurt', true);
        return amount;
    }

    // Back on your feet after dying (main.js moves you to town)
    revive() {
        this.state = 'move';
        this.health = this.maxHealth;
        this.invulnerable = 1.5;
        this.mesh.visible = true;
        this.sprite.play('idle', true);
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    get xpToNext() { return Math.round(60 * this.level ** 1.6); }

    // Base health grows 10 per level; gear and permanent boons add on top (computed in main.js)
    get baseHealth() { return 100 + (this.level - 1) * 10; }

    // Changing max health (level-up, gear) moves current health by the same amount
    setMaxHealth(max) {
        const delta = max - this.maxHealth;
        this.maxHealth = max;
        this.health = Math.max(this.dead ? 0 : 1, Math.min(max, this.health + Math.max(0, delta)));
    }

    /** Returns how many levels were gained */
    gainXp(amount) {
        this.xp += amount;
        let gained = 0;
        while (this.xp >= this.xpToNext) {
            this.xp -= this.xpToNext;
            this.level++;
            gained++;
        }
        return gained;
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
                this.sprite.play(running ? 'run' : 'walk');
                tryMove(this, move.x * speed * dt, move.y * speed * dt);
            } else {
                this.sprite.play('idle');
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
