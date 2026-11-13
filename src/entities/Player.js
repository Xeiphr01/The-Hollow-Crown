import { keys, mouse, justPressed } from '../input.js';
import { loadAnimations, frameCount } from '../assets.js';

class Player {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.spriteWidth = 64; this.spriteHeight = 64;
        this.walkSpeed = 100; this.runSpeed = 150;
        this.health = 100;
        this.stamina = 100;
        this.isDead = false; // true once the death animation has finished
        
        this.attackCooldown = 0;
        this.timeSinceLastMove = 0;
        this.idleDelay = 5.0; 
        this.playedFirstIdle = false;

        this.animations = {
            unarmed_idle: { src: 'assets/images/player_idle.png', frames: 5, speed: 0.15, name: "Hands" },
            unarmed_walk: { src: 'assets/images/player_walk.png', frames: 6, speed: 0.15 },
            unarmed_run:  { src: 'assets/images/player_run.png', frames: 8, speed: 0.12 },
            sword_idle:   { src: 'assets/images/sword_idle.png', frames: [12, 12, 12, 4], speed: 0.15, name: "Iron Sword" },
            sword_walk:   { src: 'assets/images/sword_walk.png', frames: 6, speed: 0.15 },
            sword_run:    { src: 'assets/images/sword_run.png', frames: 8, speed: 0.12 },
            sword_attack: { src: 'assets/images/sword_attack.png', frames: 8, speed: 0.07 }, 
            // Added Hurt animation
            hurt:         { src: 'assets/images/player_hurt.png', frames: 5, speed: 0.1 },
            death:        { src: 'assets/images/player_death.png', frames: 7, speed: 0.12 },
            empty_idle:   { src: 'assets/images/player_idle.png', frames: 5, speed: 0.15, name: "Empty Slot" }
        };

        loadAnimations(this.animations);

        this.weapon = 'unarmed'; 
        this.state = 'idle';
        this.frameX = 0; this.frameY = 0; this.timer = 0;
    }

    takeDamage(amount) {
        if (this.state === 'hurt' || this.state === 'death') return false; // I-frames during hurt animation
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) {
            // Death overrides every other state, so set it directly
            this.state = 'death';
            this.frameX = 0;
            this.timer = 0;
        } else {
            this.changeState('hurt');
        }
        return true;
    }

    changeState(newState) {
        if (this.state === 'death') return; // Nothing interrupts death
        // Priority Lock: Hurt and Attack cannot be interrupted by movement
        if ((this.state === 'attack' || this.state === 'hurt') && newState !== 'idle') return; 

        if (this.state !== newState) {
            this.state = newState;
            this.frameX = 0;
            this.timer = 0;
            if (['walk', 'run', 'attack', 'hurt'].includes(newState)) {
                this.playedFirstIdle = false;
                this.timeSinceLastMove = 0;
            }
        }
    }

    update(deltaTime, bounds) {
        if (this.state === 'death') {
            this.updateUI();
            this.animate(deltaTime);
            return;
        }

        if (justPressed.e) {
            const inv = document.getElementById('inventory-menu');
            if (inv) inv.classList.toggle('hidden');
            justPressed.e = false;
        }

        if (keys['1']) this.switchWeapon(0, 'unarmed');
        if (keys['2']) this.switchWeapon(1, 'sword');

        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;
        if (!['run', 'attack', 'hurt'].includes(this.state) && this.stamina < 100) {
            this.stamina += 25 * deltaTime;
        }

        const isBusy = (this.state === 'attack' || this.state === 'hurt');

        // Attack Trigger
        if (this.weapon === 'sword' && mouse.left && !isBusy && this.attackCooldown <= 0 && this.stamina >= 15) {
            this.changeState('attack');
            this.stamina -= 15;
            this.attackCooldown = 0.6;
            return;
        }

        // Cardinal Movement
        if (!isBusy) {
            let mx = 0, my = 0;
            let moving = false;

            if (keys.w) { my = -1; this.frameY = 3; moving = true; }
            else if (keys.s) { my = 1; this.frameY = 0; moving = true; }
            else if (keys.a) { mx = -1; this.frameY = 1; moving = true; }
            else if (keys.d) { mx = 1; this.frameY = 2; moving = true; }

            if (moving) {
                let isRunning = (keys.shift && this.stamina > 5);
                let speed = isRunning ? this.runSpeed : this.walkSpeed;
                if (isRunning) this.stamina -= 20 * deltaTime;
                this.changeState(isRunning ? 'run' : 'walk');
                this.x += mx * speed * deltaTime;
                this.y += my * speed * deltaTime;
                if (bounds) {
                    this.x = Math.max(0, Math.min(bounds.width - this.spriteWidth, this.x));
                    this.y = Math.max(0, Math.min(bounds.height - this.spriteHeight, this.y));
                }
                this.timeSinceLastMove = 0;
            } else {
                this.timeSinceLastMove += deltaTime;
                this.changeState('idle');
            }
        }
        this.updateUI();
        this.animate(deltaTime);
    }

    // Centre of the sword swing: a point in front of the player, in the direction they face.
    // frameY rows: 0 = down, 1 = left, 2 = right, 3 = up
    getAttackPoint(reach = 30) {
        const dirs = [[0, 1], [-1, 0], [1, 0], [0, -1]];
        const [dx, dy] = dirs[this.frameY] || [0, 1];
        return { x: this.x + 32 + dx * reach, y: this.y + 32 + dy * reach };
    }

    updateUI() {
        const sBar = document.getElementById('stamina-bar');
        if (sBar) sBar.style.width = `${Math.max(0, this.stamina)}%`;
        const hBar = document.getElementById('health-bar');
        if (hBar) hBar.style.width = `${Math.max(0, this.health)}%`;
    }

    switchWeapon(slot, type) {
        if (this.weapon === type || this.state === 'attack') return;
        this.weapon = type;
        document.querySelectorAll('.slot').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(`slot-${slot}`);
        if (el) el.classList.add('active');
        this.changeState('idle');
    }

    animate(deltaTime) {
        // Special case for Hurt animation doesn't use weapon prefix
        const animKey = (this.state === 'hurt' || this.state === 'death') ? this.state : `${this.weapon}_${this.state}`;
        const anim = this.animations[animKey] || this.animations[`${this.weapon}_idle`];
        
        let maxF = (this.state === 'idle' && this.frameY === 3) ? 1 : frameCount(anim, this.frameY);

        if (this.state === 'idle' && this.playedFirstIdle && this.timeSinceLastMove < this.idleDelay) {
            this.frameX = 0; return;
        }

        if (this.isDead) return; // Hold the last death frame

        this.timer += deltaTime;
        if (this.timer > anim.speed) {
            this.frameX++;
            if (this.state === 'death' && this.frameX >= maxF) {
                this.frameX = maxF - 1;
                this.isDead = true;
                return;
            }
            if (this.frameX >= maxF) {
                if (this.state === 'attack' || this.state === 'hurt') this.changeState('idle');
                else if (this.state === 'idle') { this.playedFirstIdle = true; this.timeSinceLastMove = 0; }
                this.frameX = 0;
            }
            this.timer = 0;
        }
    }

    draw(ctx) {
        const animKey = (this.state === 'hurt' || this.state === 'death') ? this.state : `${this.weapon}_${this.state}`;
        const anim = this.animations[animKey] || this.animations[`${this.weapon}_idle`];
        if (anim.img.complete) {
            let fx = (this.state === 'idle' && this.frameY === 3) ? 0 : this.frameX % frameCount(anim, this.frameY);
            ctx.drawImage(anim.img, fx * 64, this.frameY * 64, 64, 64, this.x, this.y, 64, 64);
        }
    }
}
export default Player;