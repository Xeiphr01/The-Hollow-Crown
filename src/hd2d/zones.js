import * as THREE from 'three';

// Named regions of a level (column/row rectangles, inclusive). Enemy zones keep up to `max`
// enemies alive, picked from `enemies` ([type, weight] pairs). Safe zones have no spawns,
// and enemies won't chase you into them.

export const OUTSKIRTS_ZONES = [
    { name: 'Willowbrook Village', cols: [17, 44], rows: [31, 47], safe: true, subtitle: 'Safe' },
    { name: 'Sunny Meadow', cols: [17, 44], rows: [13, 30], enemies: [['slime', 1]], max: 6 },
    { name: 'Old Graveyard', cols: [17, 44], rows: [0, 12], safe: true, subtitle: 'The abbey lies below' },
    { name: 'Whisperwood', cols: [0, 16], rows: [0, 47], enemies: [['wolf', 1]], max: 5 },
    { name: 'Goblin Hills', cols: [45, 63], rows: [0, 26], enemies: [['goblin', 1]], max: 4 },
    { name: 'Eastern Fields', cols: [45, 63], rows: [27, 47], enemies: [['boar', 1]], max: 4 },
];

export class Zone {
    constructor(def, level) {
        Object.assign(this, def);
        this.level = level;
        const [c0, c1] = def.cols, [r0, r1] = def.rows;
        this.tiles = level.openTiles(c0, r0, c1, r1);
        const a = level.tileToWorld(c0, r0), b = level.tileToWorld(c1, r1);
        this.center = new THREE.Vector2((a.x + b.x) / 2, (a.z + b.z) / 2);
        this.respawnTimer = 0;
    }

    containsTile(col, row) {
        return col >= this.cols[0] && col <= this.cols[1] && row >= this.rows[0] && row <= this.rows[1];
    }

    contains(pos) {
        const { col, row } = this.level.worldToTile(pos.x, pos.z);
        return this.containsTile(col, row);
    }

    // Direction back toward the zone if `pos` has strayed outside it, else null
    pull(pos) {
        if (this.contains(pos)) return null;
        return new THREE.Vector2(this.center.x - pos.x, this.center.y - pos.z).normalize();
    }

    pickEnemy() {
        const total = this.enemies.reduce((s, [, w]) => s + w, 0);
        let roll = Math.random() * total;
        for (const [type, w] of this.enemies) if ((roll -= w) < 0) return type;
        return this.enemies[0][0];
    }

    // A random open tile in the zone at least `minDist` from `awayFrom`
    spawnPoint(awayFrom, minDist) {
        const far = this.tiles.filter(t => Math.hypot(t.x - awayFrom.x, t.z - awayFrom.z) > minDist);
        return far.length ? far[Math.floor(Math.random() * far.length)] : null;
    }
}
