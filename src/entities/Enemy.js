class Enemy {
    constructor(x, y, type = 'slime') {
        this.x = x; this.y = y;
        this.spriteWidth = 64; this.spriteHeight = 64;
        this.type = type;
        this.maxHealth = 30; // Updated HP
        this.health = 30;
        this.speed = 45;
        this.damage = 10;
        this.state = 'idle';
        this.isDead = false;
        this.frameX = 0; this.frameY = 0; this.timer = 0;
        this.flipX = false; 
        this.attackCooldown = 0;

        this.animations = {
            idle:   { src: 'assets/images/Slime1_Idle_with_shadow.png', frames: 6, speed: 0.15 },
            walk:   { src: 'assets/images/Slime1_Walk_with_shadow.png', frames: 8, speed: 0.12 },
            run:    { src: 'assets/images/Slime1_Run_with_shadow.png', frames: 8, speed: 0.1 },
            attack: { src: 'assets/images/Slime1_Attack_with_shadow.png', frames: 10, speed: 0.1 },
            hurt:   { src: 'assets/images/Slime1_Hurt_with_shadow.png', frames: 5, speed: 0.1 },
            death:  { src: 'assets/images/Slime1_Death_with_shadow.png', frames: 10, speed: 0.1 }
        };

        for (let k in this.animations) {
            this.animations[k].img = new Image();
            this.animations[k].img.src = this.animations[k].src;
        }
    }

    takeDamage(amount) {
        if (this.state === 'death' || this.state === 'hurt') return false;
        this.health -= amount;
        this.changeState(this.health <= 0 ? 'death' : 'hurt');
        return true;
    }

    changeState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.frameX = 0;
            this.timer = 0;
        }
    }

    update(deltaTime, player) {
        if (this.isDead) return;
        if (this.attackCooldown > 0) this.attackCooldown -= deltaTime;

        if (this.state === 'death' || this.state === 'hurt') {
            this.animate(deltaTime);
            return;
        }

        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 180 && dist > 35) {
            this.changeState('run');
            if (Math.abs(dx) > Math.abs(dy)) {
                this.frameY = 1;
                this.flipX = dx > 0;
                this.x += (dx > 0 ? 1 : -1) * this.speed * deltaTime;
            } else {
                this.flipX = false;
                this.frameY = dy > 0 ? 0 : 3;
                this.y += (dy > 0 ? 1 : -1) * this.speed * deltaTime;
            }
        } else if (dist <= 35) {
            this.changeState('attack');
        } else {
            this.changeState('idle');
        }
        this.animate(deltaTime);
    }

    animate(deltaTime) {
        const anim = this.animations[this.state];
        this.timer += deltaTime;
        if (this.timer > anim.speed) {
            this.frameX++;
            if (this.frameX >= anim.frames) {
                if (this.state === 'death') this.isDead = true;
                else if (this.state === 'hurt' || this.state === 'attack') this.changeState('idle');
                this.frameX = 0;
            }
            this.timer = 0;
        }
    }

    draw(ctx) {
        const anim = this.animations[this.state];
        if (anim.img.complete) {
            ctx.save();
            if (this.flipX) {
                ctx.translate(this.x + 64, this.y);
                ctx.scale(-1, 1);
                ctx.drawImage(anim.img, this.frameX * 64, this.frameY * 64, 64, 64, 0, 0, 64, 64);
            } else {
                ctx.drawImage(anim.img, this.frameX * 64, this.frameY * 64, 64, 64, this.x, this.y, 64, 64);
            }
            ctx.restore();

            if (this.state !== 'death') {
                ctx.fillStyle = 'black';
                ctx.fillRect(this.x + 12, this.y - 8, 40, 4);
                ctx.fillStyle = '#2ecc71';
                ctx.fillRect(this.x + 12, this.y - 8, (this.health / this.maxHealth) * 40, 4);
            }
        }
    }
}
export default Enemy;