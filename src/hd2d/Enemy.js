import * as THREE from 'three';
import { Billboard, loadSheet } from './Billboard.js';

// Every enemy shares one AI (wander → chase → attack) and differs only by these numbers.
// `anims` lists sheet columns; all sheets use rows 0 down, 1 left, 2 right, 3 up.
// `loot.items` entries are [itemId, count, chance]; `loot.equip` is the chance of a random
// weapon/armor drop; `loot.unique` always drops. Bosses ignore knockback and don't flinch.
// Deeper dungeon floors multiply hp, damage, gold and xp by a `power` factor.

const S = 'assets/sprites/';
const HUMANOID = {
    idle: [0], walk: [1, 0, 2, 0], run: [1, 0, 2, 0], attack: [3, 4, 4], hurt: [7, 0], death: [7, 7, 7],
};

export const ENEMY_TYPES = {
    slime: {
        name: 'Slime', hp: 30, damage: 10, speed: 1.4, chaseRange: 5, attackRange: 0.9, hitFrame: 2, cooldown: 1.0,
        variants: ['Blue', 'Green', 'Orange', 'Pink', 'Purple'].map(c => [`${S}slime/Slime_${c}.png`]),
        anims: { idle: [0, 1, 2, 1], walk: [1, 4, 2, 4], run: [1, 4, 2, 4], attack: [0, 3, 3, 3, 0], hurt: [7, 0], death: [7, 7, 7, 7] },
        feetPx: 123, barY: 0.72, xp: 8,
        loot: { gold: [2, 5], items: [['slime_gel', 1, 0.8], ['potion', 1, 0.12]], equip: 0.06 },
    },
    wolf: {
        name: 'Wolf', hp: 24, damage: 8, speed: 2.6, chaseRange: 7, attackRange: 1.0, hitFrame: 2, cooldown: 0.9,
        variants: ['wolf_gray', 'wolf', 'wolf_black'].map(v => [`${S}enemies/${v}.png`]),
        anims: { idle: [0], walk: [1, 0, 2, 0], run: [1, 2], attack: [4, 3, 3, 0], hurt: [4, 0], death: [7, 7, 7] },
        feetPx: 118, barY: 0.85, xp: 10,
        loot: { gold: [3, 6], items: [['wolf_pelt', 1, 0.6]], equip: 0.08 },
    },
    boar: {
        name: 'Boar', hp: 45, damage: 14, speed: 1.8, chaseRange: 5, attackRange: 1.0, hitFrame: 2, cooldown: 1.4,
        variants: [[`${S}enemies/Boar.png`]],
        anims: { idle: [0], walk: [1, 0, 2, 0], run: [1, 2], attack: [3, 3, 4, 3], hurt: [4, 0], death: [7, 7, 7] },
        feetPx: 120, barY: 0.85, xp: 16,
        loot: { gold: [4, 8], items: [['boar_tusk', 1, 0.7]], equip: 0.1 },
    },
    goblin: {
        name: 'Goblin', hp: 28, damage: 9, speed: 2.0, chaseRange: 6, attackRange: 0.9, hitFrame: 1, cooldown: 0.8,
        variants: [[`${S}enemies/Goblin.png`, `${S}enemies/GoblinWarriorLoincloth.png`, `${S}enemies/Dagger_01_Short_Child.png`]],
        anims: HUMANOID, feetPx: 125, barY: 0.85, xp: 14,
        loot: { gold: [6, 12], items: [['potion', 1, 0.15], ['return_scroll', 1, 0.08]], equip: 0.12 },
    },
    skeleton: {
        name: 'Skeleton', hp: 40, damage: 12, speed: 1.3, chaseRange: 6, attackRange: 1.0, hitFrame: 1, cooldown: 1.1,
        variants: [[`${S}enemies/Skeleton.png`, `${S}enemies/Sword_01_Arming_Undead.png`]],
        anims: HUMANOID, feetPx: 123, barY: 1.15, xp: 18,
        loot: { gold: [8, 15], items: [['bone', 1, 0.7], ['potion', 1, 0.15], ['return_scroll', 1, 0.08]], equip: 0.14 },
    },

    // --- Named and boss enemies ---
    alpha_wolf: {
        name: 'Alpha Wolf', hp: 140, damage: 13, speed: 2.9, chaseRange: 8, attackRange: 1.1, hitFrame: 2, cooldown: 0.8,
        variants: [[`${S}enemies/wolf_black.png`]], scale: 1.35, boss: true,
        anims: { idle: [0], walk: [1, 0, 2, 0], run: [1, 2], attack: [4, 3, 3, 0], hurt: [0], death: [7, 7, 7] },
        feetPx: 118, barY: 1.15, xp: 120,
        loot: { gold: [40, 60], items: [['wolf_pelt', 3, 1]], equip: 0.6 },
    },
    gravewarden: {
        name: 'The Gravewarden', hp: 300, damage: 18, speed: 1.5, chaseRange: 10, attackRange: 1.3, hitFrame: 1, cooldown: 1.3,
        variants: [[`${S}enemies/Juggernaut.png`]], scale: 1.15, boss: true,
        anims: { idle: [0], walk: [1, 0, 2, 0], run: [1, 0, 2, 0], attack: [3, 4, 4], hurt: [0], death: [7, 7, 7, 7] },
        feetPx: 124, barY: 1.85, xp: 320,
        loot: { gold: [120, 160], items: [['potion', 2, 1]], equip: 1, unique: 'wardens_oath' },
    },
    goblin_chieftain: {
        name: 'Goblin Chieftain', hp: 420, damage: 22, speed: 2.1, chaseRange: 10, attackRange: 1.2, hitFrame: 1, cooldown: 1.0,
        variants: [[`${S}enemies/Goblin.png`, `${S}enemies/GoblinShamanLoincloth.png`, `${S}enemies/Axe_02_Obsidian_Child.png`]],
        scale: 1.6, boss: true, anims: { ...HUMANOID, hurt: [0] },
        feetPx: 125, barY: 1.35, xp: 520,
        loot: { gold: [200, 260], items: [['potion', 2, 1], ['return_scroll', 2, 1]], equip: 1, unique: 'chieftains_cleaver' },
    },
};

const sheetKey = (type, v) => `enemy_${type}_${v}`;

export function loadEnemySheets() {
    const jobs = [];
    for (const [type, def] of Object.entries(ENEMY_TYPES)) {
        def.variants.forEach((layers, v) => jobs.push(loadSheet(sheetKey(type, v), layers)));
    }
    return Promise.all(jobs);
}

const ROW = { down: 0, left: 1, right: 2, up: 3 };
const FADE_SECONDS = 0.6;

export class Enemy {
    /** @param power stat multiplier for deeper floors (1 = outskirts) */
    constructor(type, x, z, zone, power = 1) {
        const def = ENEMY_TYPES[type];
        this.type = type;
        this.def = def;
        this.zone = zone;
        this.power = power;
        const sheet = sheetKey(type, Math.floor(Math.random() * def.variants.length));
        const a = def.anims;
        this.sprite = new Billboard({
            idle:   { sheet, frames: a.idle, speed: 0.2 },
            walk:   { sheet, frames: a.walk, speed: 0.15 },
            run:    { sheet, frames: a.run, speed: 0.1 },
            attack: { sheet, frames: a.attack, speed: 0.1, loop: false },
            hurt:   { sheet, frames: a.hurt, speed: 0.15, loop: false },
            death:  { sheet, frames: a.death, speed: 0.15, loop: false },
        }, { ppu: 72, feetPx: def.feetPx, scale: def.scale ?? 1 });
        this.mesh = this.sprite.mesh;
        this.mesh.position.set(x, 0, z);

        this.maxHealth = Math.round(def.hp * power); this.health = this.maxHealth;
        this.damage = Math.round(def.damage * power);
        this.xp = Math.round(def.xp * power);
        this.flash = 0;
        this.state = 'move'; // move | attack | hurt | dying | dead
        this.dir = new THREE.Vector2();
        this.knock = new THREE.Vector2();
        this.wanderTimer = Math.random() * 2;
        this.attackCooldown = 0;
        this.fade = 0;
        this.hitDone = false;
        this.hitPlayer = false; // set on the frame the attack lands; main.js consumes it
        this.buildHealthBar();
    }

    get position() { return this.mesh.position; }

    // Small bar above the head, only shown once the enemy has been hit
    buildHealthBar() {
        const W = 0.7;
        const onTop = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false });
        this.bar = new THREE.Group();
        const bg = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.04, 0.1), onTop('#111'));
        this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(W, 0.06).translate(W / 2, 0, 0), onTop('#e74c3c'));
        this.barFill.position.x = -W / 2;
        bg.renderOrder = 20;
        this.barFill.renderOrder = 21;
        this.bar.add(bg, this.barFill);
        this.bar.position.y = this.def.barY;
        this.bar.visible = false;
        if (this.def.boss) this.bar.scale.setScalar(1.6);
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
        } else if (this.def.boss) {
            this.flash = 0.15; // bosses shrug hits off: a red flash, no stagger
        } else {
            this.state = 'hurt';
            this.sprite.play('hurt', true);
            this.knock.set(this.position.x - from.x, this.position.z - from.z).setLength(4);
        }
        return true;
    }

    /** @param canChase false while the player is somewhere enemies won't follow (the village) */
    update(dt, player, tryMove, camera, canChase) {
        const def = this.def;
        if (this.attackCooldown > 0) this.attackCooldown -= dt;
        const dx = player.position.x - this.position.x;
        const dz = player.position.z - this.position.z;
        const dist = Math.hypot(dx, dz);
        const hunting = (canChase || this.def.boss) && !player.dead;
        if (this.flash > 0) this.flash -= dt;
        this.mesh.material.color.set(this.flash > 0 ? '#ff6b6b' : '#ffffff');

        switch (this.state) {
            case 'dying':
                // Hold the last death frame, then fade out
                if (this.sprite.done) {
                    this.fade += dt;
                    this.mesh.material.transparent = true;
                    this.mesh.material.alphaTest = 0.05; // alphaTest compares against alpha × opacity
                    this.mesh.material.opacity = Math.max(0, 1 - this.fade / FADE_SECONDS);
                    if (this.fade >= FADE_SECONDS) this.state = 'dead';
                }
                break;
            case 'hurt':
                tryMove(this, this.knock.x * dt, this.knock.y * dt);
                this.knock.multiplyScalar(Math.exp(-10 * dt));
                if (this.sprite.done) this.state = 'move';
                break;
            case 'attack':
                if (!this.hitDone && this.sprite.frame >= def.hitFrame) {
                    this.hitDone = true;
                    if (dist < def.attackRange + 0.2 && !player.dead) this.hitPlayer = true;
                }
                if (this.sprite.done) {
                    this.state = 'move';
                    this.attackCooldown = def.cooldown;
                }
                break;
            default:
                if (hunting && dist < def.attackRange && this.attackCooldown <= 0) {
                    this.state = 'attack';
                    this.hitDone = false;
                    this.face(dx, dz);
                    this.sprite.play('attack', true);
                } else if (hunting && dist < def.chaseRange) {
                    this.face(dx, dz);
                    this.sprite.play('run');
                    if (dist > def.attackRange * 0.8) tryMove(this, (dx / dist) * def.speed * dt, (dz / dist) * def.speed * dt);
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
            // Drifted out of its home zone: head back toward the middle of it
            const back = this.zone && this.zone.pull(this.position);
            if (back) this.dir.copy(back);
        }
        if (this.dir.lengthSq() === 0) {
            this.sprite.play('idle');
            return;
        }
        this.face(this.dir.x, this.dir.y);
        this.sprite.play('walk');
        const speed = Math.min(0.7, this.def.speed * 0.4);
        tryMove(this, this.dir.x * speed * dt, this.dir.y * speed * dt);
    }
}
