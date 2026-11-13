import { ITEMS } from './items.js';
import { showLabel } from './ui.js';

// Slots 0-4 are the hotbar, 5-24 the backpack. Each slot is null or { id, count }.
export const HOTBAR = 5;
const SIZE = 25;

export class Inventory {
    constructor() {
        this.slots = new Array(SIZE).fill(null);
        this.selected = 0;
        this.onChange = () => {};
    }

    reset() {
        this.slots.fill(null);
        this.selected = 0;
        this.onChange();
    }

    get selectedItem() {
        const s = this.slots[this.selected];
        return s ? { ...ITEMS[s.id], id: s.id, count: s.count } : null;
    }

    // Tops up existing stacks first, then fills empty slots. Returns how many didn't fit.
    add(id, count = 1) {
        const max = ITEMS[id].stack;
        for (const s of this.slots) {
            if (count === 0) break;
            if (s && s.id === id && s.count < max) {
                const n = Math.min(count, max - s.count);
                s.count += n;
                count -= n;
            }
        }
        for (let i = 0; i < SIZE && count > 0; i++) {
            if (this.slots[i]) continue;
            const n = Math.min(count, max);
            this.slots[i] = { id, count: n };
            count -= n;
        }
        this.onChange();
        return count;
    }

    consumeSelected(n = 1) {
        const s = this.slots[this.selected];
        if (!s) return;
        s.count -= n;
        if (s.count <= 0) this.slots[this.selected] = null;
        this.onChange();
    }

    // Drag-and-drop: merge matching stacks, otherwise swap
    move(from, to) {
        if (from === to) return;
        const a = this.slots[from], b = this.slots[to];
        if (a && b && a.id === b.id && ITEMS[a.id].stack > 1) {
            const n = Math.min(a.count, ITEMS[b.id].stack - b.count);
            b.count += n;
            a.count -= n;
            if (a.count === 0) this.slots[from] = null;
        } else {
            this.slots[from] = b;
            this.slots[to] = a;
        }
        this.onChange();
    }

    select(i) {
        this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR;
        this.onChange();
    }
}

// Renders the hotbar and backpack panel and handles dragging items between slots
export class InventoryUI {
    constructor(inventory) {
        this.inv = inventory;
        this.panel = document.getElementById('backpack');
        this.slotEls = [];
        const hotbar = document.getElementById('hotbar');
        const grid = document.getElementById('backpack-grid');
        for (let i = 0; i < SIZE; i++) {
            const el = this.makeSlot(i);
            (i < HOTBAR ? hotbar : grid).appendChild(el);
            this.slotEls.push(el);
        }
        this.lastSelected = -1;
        this.lastSelectedId = undefined;
        inventory.onChange = () => this.render();
        this.render();
    }

    makeSlot(i) {
        const el = document.createElement('div');
        el.className = 'slot';
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-target'); });
        el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drop-target');
            const from = Number(e.dataTransfer.getData('text/plain'));
            if (!Number.isNaN(from)) this.inv.move(from, i);
        });
        if (i < HOTBAR) el.addEventListener('click', () => this.inv.select(i));
        return el;
    }

    render() {
        this.slotEls.forEach((el, i) => {
            el.innerHTML = '';
            el.classList.toggle('active', i === this.inv.selected);
            if (i < HOTBAR) el.insertAdjacentHTML('beforeend', `<span class="key-label">${i + 1}</span>`);
            const s = this.inv.slots[i];
            if (!s) { el.title = ''; return; }
            const def = ITEMS[s.id];
            el.title = def.name;
            const img = document.createElement('img');
            img.src = def.icon;
            img.alt = def.name;
            img.draggable = true;
            img.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(i)));
            el.appendChild(img);
            if (s.count > 1) el.insertAdjacentHTML('beforeend', `<span class="count">${s.count}</span>`);
        });

        // Announce the held item when the selection (or what's in the selected slot) changes
        const id = this.inv.slots[this.inv.selected]?.id;
        if (this.inv.selected !== this.lastSelected || id !== this.lastSelectedId) {
            showLabel(id ? ITEMS[id].name : 'Empty hand');
            this.lastSelected = this.inv.selected;
            this.lastSelectedId = id;
        }
    }

    get isOpen() { return !this.panel.classList.contains('hidden'); }
    toggle() { this.panel.classList.toggle('hidden'); }
    close() { this.panel.classList.add('hidden'); }
}
