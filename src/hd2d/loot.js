import * as THREE from 'three';
import { itemInfo } from './items.js';

// Things lying on the ground waiting to be picked up: gold piles, items and lore pages.
// Each floats and bobs, always facing the camera; magic and unique items glow in their colour.

const loader = new THREE.TextureLoader();
const textures = new Map();
const camDir = new THREE.Vector3();

function iconTexture(url) {
    if (!textures.has(url)) {
        const tex = loader.load(url);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        textures.set(url, tex);
    }
    return textures.get(url);
}

function pixelArt(rows, palette) {
    const canvas = document.createElement('canvas');
    canvas.width = rows[0].length; canvas.height = rows.length;
    const g = canvas.getContext('2d');
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
        if (palette[ch]) { g.fillStyle = palette[ch]; g.fillRect(x, y, 1, 1); }
    }));
    return canvas.toDataURL();
}

const COINS = pixelArt([
    '..........',
    '...yyyy...',
    '..yYYYYy..',
    '..yyyyyy..',
    '.yyyy.....',
    'yYYYYy.yy.',
    'yyyyyyyYYy',
    'yYYYYyyyyy',
    'yyyyyy....',
], { y: '#c99a1c', Y: '#ffe066' });

const PAGE = pixelArt([
    '.pppppp...',
    '.pllllpp..',
    '.plbblllp.',
    '.pllllllp.',
    '.plbbbblp.',
    '.pllllllp.',
    '.plbbbllp.',
    '.pllllllp.',
    '.pppppppp.',
], { p: '#8a6a3c', l: '#efe2bf', b: '#5a4a35' });

const GLOW = { magic: '#4f8cff', unique: '#ffb02e', lore: '#c9a0ff', quest: '#ff6b6b' };

export class GroundItem {
    /**
     * @param kind 'gold' (payload = amount) | 'item' (payload = instance) | 'lore' (payload = page number)
     */
    constructor(kind, payload, x, z) {
        this.kind = kind;
        this.payload = payload;
        this.group = new THREE.Group();
        this.group.position.set(x, 0, z);
        this.phase = Math.random() * Math.PI * 2;

        let icon = COINS, glow = null, size = 0.45;
        if (kind === 'item') {
            const info = itemInfo(payload);
            icon = info.icon;
            size = 0.55;
            glow = info.quest ? GLOW.quest : GLOW[info.rarity] ?? null;
            this.info = info;
        } else if (kind === 'lore') {
            icon = PAGE;
            glow = GLOW.lore;
        }

        this.sprite = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
            new THREE.MeshBasicMaterial({ map: iconTexture(icon), alphaTest: 0.1, side: THREE.DoubleSide }));
        this.group.add(this.sprite);

        if (glow) {
            const color = new THREE.Color(glow).multiplyScalar(2.2); // HDR so the bloom pass picks it up
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 24).rotateX(-Math.PI / 2),
                new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
            ring.position.y = 0.03;
            this.group.add(ring);
            if (kind === 'lore' || payload?.rarity === 'unique' || this.info?.rarity === 'unique') {
                // A faint beam of light so rare finds are visible from across the room
                const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8, 1, true),
                    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false }));
                beam.position.y = 1.2;
                this.group.add(beam);
            }
        }
    }

    get position() { return this.group.position; }

    update(t, camera) {
        this.sprite.position.y = 0.35 + Math.sin(t * 3 + this.phase) * 0.06;
        camera.getWorldDirection(camDir);
        this.sprite.rotation.set(0, Math.atan2(-camDir.x, -camDir.z), 0);
    }

    dispose() {
        this.group.removeFromParent();
        this.group.traverse(o => {
            o.geometry?.dispose();
            if (o.material && o !== this.sprite) o.material.dispose();
        });
        this.sprite.material.dispose(); // the icon texture itself is cached and shared
    }
}
