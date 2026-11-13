// Corner map: the level's terrain is painted once per level, then dots for you, NPCs and
// enemies each frame. In the abbey, only tiles you've been near are shown (fog of war).
const SCALE = 3; // pixels per tile
const COLORS = {
    '.': '#4f9e4b', ',': '#5fae4f', '=': '#cdb27c', 'T': '#2a6b35', '#': '#6f8a5c', ';': '#6f8a5c', 't': '#2a6b35',
    'F': '#8b5a2b', '~': '#3f8fd2', 'g': '#9a9da5', 'c': '#ff9a3c', 'H': '#b5543c', '>': '#ffd166',
};
const DUNGEON_COLORS = { 'W': '#24242c', '.': '#6d6f7a', '<': '#9ec5ff', '>': '#ffd166', 'g': '#8d9099', 'r': '#6b5a48' };

export class Minimap {
    constructor(canvas) {
        this.canvas = canvas;
        this.g = canvas.getContext('2d');
        this.base = document.createElement('canvas');
    }

    setLevel(level) {
        this.level = level;
        this.canvas.width = this.base.width = level.W * SCALE;
        this.canvas.height = this.base.height = level.H * SCALE;
        const colors = level.kind === 'dungeon' ? DUNGEON_COLORS : COLORS;
        const b = this.base.getContext('2d');
        for (let row = 0; row < level.H; row++) {
            for (let col = 0; col < level.W; col++) {
                b.fillStyle = colors[level.grid[row][col]] ?? '#4f9e4b';
                b.fillRect(col * SCALE, row * SCALE, SCALE, SCALE);
            }
        }
    }

    dot(pos, color, size) {
        const { col, row } = this.level.worldToTile(pos.x, pos.z);
        if (this.level.explored && !this.level.explored[row * this.level.W + col]) return;
        this.g.fillStyle = color;
        this.g.fillRect(col * SCALE + (SCALE - size) / 2, row * SCALE + (SCALE - size) / 2, size, size);
    }

    draw(player, enemies, npcs, extras = []) {
        const { level, g } = this;
        g.drawImage(this.base, 0, 0);
        if (level.explored) {
            g.fillStyle = '#000';
            for (let row = 0; row < level.H; row++) {
                for (let col = 0; col < level.W; col++) {
                    if (!level.explored[row * level.W + col]) g.fillRect(col * SCALE, row * SCALE, SCALE, SCALE);
                }
            }
        }
        for (const n of npcs) if (n.talkable) this.dot(n.position, '#ffe066', 3);
        for (const e of enemies) if (e.state !== 'dead') this.dot(e.position, e.def.boss ? '#ff00ff' : '#e74c3c', e.def.boss ? 5 : 3);
        for (const x of extras) this.dot(x.pos, x.color, 3);
        this.dot(player.position, '#ffffff', 5);
    }
}
