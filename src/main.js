import Player from './entities/Player.js';
import Enemy from './entities/Enemy.js';
import { justPressed } from './input.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 450;

let player;
let enemies;
// Floating damage text array
let damageTexts;

function resetGame() {
    player = new Player(400, 225);
    enemies = [
        new Enemy(150, 100, 'slime'),
        new Enemy(600, 150, 'slime'),
        new Enemy(200, 350, 'slime')
    ];
    damageTexts = [];
    setupUI();
}

function setupUI() {
    const hb = document.getElementById('hotbar');
    if (hb) {
        hb.innerHTML = '';
        for (let i = 0; i < 5; i++) {
            const s = document.createElement('div');
            s.className = i === 0 ? 'slot active' : 'slot';
            s.id = `slot-${i}`;
            s.innerHTML = `<span class="key-label">${i+1}</span>`;
            hb.appendChild(s);
        }
    }
}

function spawnDamageText(x, y, text, color = "white") {
    damageTexts.push({ x, y, text, color, life: 1.0 });
}

function update(dt) {
    // Game over: wait for R to restart
    if (player.isDead) {
        if (justPressed.r) { justPressed.r = false; resetGame(); }
        return;
    }
    justPressed.r = false;

    player.update(dt, canvas);
    enemies = enemies.filter(enemy => !enemy.isDead);

    enemies.forEach(enemy => {
        enemy.update(dt, player);

        // 1. Player Hits Enemy (5 DMG) - only enemies in front of the player
        if (player.state === 'attack' && player.frameX === 5) {
            const hit = player.getAttackPoint();
            const dx = hit.x - (enemy.x + 32);
            const dy = hit.y - (enemy.y + 32);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 38) {
                if (enemy.takeDamage(5)) {
                    spawnDamageText(enemy.x + 32, enemy.y, "-5", "#ff4757");
                }
            }
        }

        // 2. Enemy Hits Player (10 DMG)
        if (enemy.state === 'attack' && enemy.frameX === 6) {
            const dx = (player.x + 32) - (enemy.x + 32);
            const dy = (player.y + 32) - (enemy.y + 32);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 40) {
                if (player.takeDamage(10)) {
                    spawnDamageText(player.x + 32, player.y, "-10", "#f1c40f");
                }
            }
        }
    });

    // Update floating texts (filter instead of splicing mid-loop, which skipped entries)
    damageTexts.forEach(t => {
        t.y -= 40 * dt; // Rise up
        t.life -= dt;
    });
    damageTexts = damageTexts.filter(t => t.life > 0);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const renderList = [player, ...enemies];
    renderList.sort((a, b) => (a.y + 60) - (b.y + 60));

    renderList.forEach(e => e.draw(ctx));

    // Draw damage numbers
    ctx.textAlign = "center";
    ctx.font = "bold 16px Arial";
    damageTexts.forEach(t => {
        ctx.fillStyle = `rgba(${t.color === '#ff4757' ? '255,71,87' : '241,196,15'}, ${t.life})`;
        ctx.fillText(t.text, t.x, t.y);
    });

    // Game over overlay
    if (player.isDead) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#c0392b';
        ctx.font = 'bold 48px "Courier New", monospace';
        ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2);
        ctx.fillStyle = '#eee';
        ctx.font = '18px "Courier New", monospace';
        ctx.fillText('Press R to restart', canvas.width / 2, canvas.height / 2 + 40);
    }
}

let lastTime = 0;
function loop(ts) {
    let dt = (ts - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1;
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
}

resetGame();
requestAnimationFrame(loop);