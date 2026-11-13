import { ITEMS, itemInfo, canStack, describe } from './items.js';
import { showLabel } from './ui.js';

// Slots 0-4 are the hotbar, 5-24 the backpack. Each slot is null or an item instance
// ({ id, count } plus affixes for magic items — see items.js). Worn gear lives in `equipment`.
export const HOTBAR = 5;
const SIZE = 25;
export const GEAR_SLOTS = ['body', 'head', 'offhand'];
const GEAR_LABELS = { body: 'Armor', head: 'Head', offhand: 'Shield' };

export class Inventory {
    constructor() {
        this.slots = new Array(SIZE).fill(null);
        this.equipment = { body: null, head: null, offhand: null };
        this.selected = 0;
        this.gold = 0;
        this.listeners = [];
    }

    onChange(fn) { this.listeners.push(fn); }
    changed() { this.listeners.forEach(fn => fn()); }

    reset() {
        this.slots.fill(null);
        GEAR_SLOTS.forEach(s => { this.equipment[s] = null; });
        this.selected = 0;
        this.gold = 0;
        this.changed();
    }

    get selectedItem() {
        const s = this.slots[this.selected];
        return s ? itemInfo(s) : null;
    }

    // Everything shaping the player's look and stats, as itemInfo objects (or null)
    get gear() {
        const info = (inst) => (inst ? itemInfo(inst) : null);
        return {
            body: info(this.equipment.body),
            head: info(this.equipment.head),
            offhand: info(this.equipment.offhand),
            held: this.selectedItem,
        };
    }

    // Worn gear plus the held weapon's bonuses (a weapon "of the Bear" adds HP while held)
    get bonuses() {
        const g = this.gear;
        const worn = [g.body, g.head, g.offhand].filter(Boolean);
        return {
            defense: worn.reduce((sum, i) => sum + (i.defense ?? 0), 0),
            hp: [...worn, g.held?.damage ? g.held : null].filter(Boolean).reduce((sum, i) => sum + i.hp, 0),
            damage: worn.reduce((sum, i) => sum + (i.damage ?? 0), 0), // e.g. Hunter's Horns
        };
    }

    count(id) {
        return this.slots.reduce((n, s) => n + (s?.id === id ? s.count : 0), 0);
    }

    hasRoomFor(inst) {
        return this.slots.some(s => !s || (canStack(s, inst) && s.count < ITEMS[s.id].stack));
    }

    /** Add an instance (or a plain id + count). Tops up stacks first. Returns how many didn't fit. */
    add(instOrId, n = 1) {
        const inst = typeof instOrId === 'string' ? { id: instOrId, count: n } : { count: 1, ...instOrId };
        let count = inst.count;
        const max = ITEMS[inst.id].stack;
        for (const s of this.slots) {
            if (count === 0) break;
            if (s && canStack(s, inst) && s.count < max) {
                const k = Math.min(count, max - s.count);
                s.count += k;
                count -= k;
            }
        }
        // Potions and scrolls fill the hotbar first; everything else fills the backpack first
        const quick = Boolean(ITEMS[inst.id].heal || ITEMS[inst.id].use);
        const order = [...Array(SIZE).keys()].sort((a, b) => quick ? a - b : (a < HOTBAR) - (b < HOTBAR) || a - b);
        for (const i of order) {
            if (count === 0) break;
            if (this.slots[i]) continue;
            const k = Math.min(count, max);
            this.slots[i] = { ...inst, count: k };
            count -= k;
        }
        this.changed();
        return count;
    }

    removeAt(i, n = 1) {
        const s = this.slots[i];
        if (!s) return;
        s.count -= n;
        if (s.count <= 0) this.slots[i] = null;
        this.changed();
    }

    // Remove `n` of an item wherever it is (quest hand-ins, using scrolls from any slot)
    removeId(id, n = 1) {
        for (let i = 0; i < SIZE && n > 0; i++) {
            const s = this.slots[i];
            if (s?.id !== id) continue;
            const k = Math.min(n, s.count);
            s.count -= k;
            n -= k;
            if (s.count <= 0) this.slots[i] = null;
        }
        this.changed();
    }

    consumeSelected(n = 1) { this.removeAt(this.selected, n); }

    // Drag-and-drop between inventory slots: merge matching stacks, otherwise swap
    move(from, to) {
        if (from === to) return;
        const a = this.slots[from], b = this.slots[to];
        if (a && b && canStack(a, b)) {
            const k = Math.min(a.count, ITEMS[b.id].stack - b.count);
            b.count += k;
            a.count -= k;
            if (a.count === 0) this.slots[from] = null;
        } else {
            this.slots[from] = b;
            this.slots[to] = a;
        }
        this.changed();
    }

    // Wear the item in slot i; whatever was worn before takes its place in the bag
    equip(i) {
        const s = this.slots[i];
        const gearSlot = s && ITEMS[s.id].slot;
        if (!gearSlot) return false;
        this.slots[i] = this.equipment[gearSlot];
        this.equipment[gearSlot] = s;
        this.changed();
        return true;
    }

    // Take off gear into slot i (or the first free slot). Swaps if slot i holds gear of the same kind.
    unequip(gearSlot, i = this.slots.indexOf(null)) {
        const worn = this.equipment[gearSlot];
        if (!worn || i < 0) return false;
        const target = this.slots[i];
        if (target && ITEMS[target.id].slot !== gearSlot) return false;
        this.equipment[gearSlot] = target;
        this.slots[i] = worn;
        this.changed();
        return true;
    }

    select(i) {
        this.selected = ((i % HOTBAR) + HOTBAR) % HOTBAR;
        this.changed();
    }

    toJSON() {
        return { slots: this.slots, equipment: this.equipment, selected: this.selected, gold: this.gold };
    }

    load(data) {
        this.slots = data.slots.map(s => (s && ITEMS[s.id] ? s : null)); // drop items that no longer exist
        for (const g of GEAR_SLOTS) this.equipment[g] = data.equipment[g] && ITEMS[data.equipment[g].id] ? data.equipment[g] : null;
        this.selected = data.selected ?? 0;
        this.gold = data.gold ?? 0;
        this.changed();
    }
}

// Renders the hotbar, backpack and equipment panel, and handles dragging items around.
// Drag payloads are "inv:<index>" or "gear:<slot>".
export class InventoryUI {
    constructor(inventory, statsFn) {
        this.inv = inventory;
        this.statsFn = statsFn; // () => { atk, def, hp } for the stats line
        this.panel = document.getElementById('backpack');
        this.slotEls = [];
        const hotbar = document.getElementById('hotbar');
        const grid = document.getElementById('backpack-grid');
        for (let i = 0; i < SIZE; i++) {
            const el = this.makeSlot(`inv:${i}`);
            (i < HOTBAR ? hotbar : grid).appendChild(el);
            this.slotEls.push(el);
        }
        this.gearEls = {};
        const gearBox = document.getElementById('gear-slots');
        for (const g of GEAR_SLOTS) {
            const wrap = document.createElement('div');
            wrap.className = 'gear-row';
            const el = this.makeSlot(`gear:${g}`);
            el.classList.add('gear');
            wrap.append(el, Object.assign(document.createElement('span'), { textContent: GEAR_LABELS[g] }));
            gearBox.appendChild(wrap);
            this.gearEls[g] = el;
        }
        this.lastSelected = -1;
        this.lastSelectedName = undefined;
        inventory.onChange(() => this.render());
        this.render();
    }

    makeSlot(target) {
        const el = document.createElement('div');
        el.className = 'slot';
        el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drop-target'); });
        el.addEventListener('dragleave', () => el.classList.remove('drop-target'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            el.classList.remove('drop-target');
            this.drop(e.dataTransfer.getData('text/plain'), target);
        });
        el.addEventListener('dblclick', () => this.quickEquip(target));
        const [kind, key] = target.split(':');
        if (kind === 'inv' && Number(key) < HOTBAR) el.addEventListener('click', () => this.inv.select(Number(key)));
        return el;
    }

    drop(source, target) {
        const [fromKind, fromKey] = source.split(':');
        const [toKind, toKey] = target.split(':');
        if (fromKind === 'inv' && toKind === 'inv') this.inv.move(Number(fromKey), Number(toKey));
        else if (fromKind === 'inv' && toKind === 'gear') {
            const s = this.inv.slots[Number(fromKey)];
            if (s && ITEMS[s.id].slot === toKey) this.inv.equip(Number(fromKey));
            else if (s) showLabel(`${itemInfo(s).name} can't be worn there`);
        } else if (fromKind === 'gear' && toKind === 'inv') {
            if (!this.inv.unequip(fromKey, Number(toKey))) showLabel("Can't put that there");
        }
    }

    // Double-click: wear gear from the bag, or take worn gear off
    quickEquip(target) {
        const [kind, key] = target.split(':');
        if (kind === 'inv') this.inv.equip(Number(key));
        else if (!this.inv.unequip(key)) showLabel('Backpack full');
    }

    fill(el, inst, dragPayload) {
        el.querySelectorAll('img, .count').forEach(n => n.remove());
        el.classList.remove('rarity-magic', 'rarity-unique');
        if (!inst) { el.title = ''; return; }
        const info = itemInfo(inst);
        el.title = describe(info);
        if (info.rarity !== 'common') el.classList.add(`rarity-${info.rarity}`);
        const img = document.createElement('img');
        img.src = info.icon;
        img.alt = info.name;
        img.draggable = true;
        img.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', dragPayload));
        el.appendChild(img);
        if (info.count > 1) el.insertAdjacentHTML('beforeend', `<span class="count">${info.count}</span>`);
    }

    render() {
        this.slotEls.forEach((el, i) => {
            el.classList.toggle('active', i === this.inv.selected);
            if (i < HOTBAR && !el.querySelector('.key-label')) {
                el.insertAdjacentHTML('afterbegin', `<span class="key-label">${i + 1}</span>`);
            }
            this.fill(el, this.inv.slots[i], `inv:${i}`);
        });
        for (const g of GEAR_SLOTS) this.fill(this.gearEls[g], this.inv.equipment[g], `gear:${g}`);

        const stats = this.statsFn();
        document.getElementById('stat-atk').textContent = stats.atk;
        document.getElementById('stat-def').textContent = stats.def;
        document.getElementById('stat-hp').textContent = stats.hp;
        document.querySelectorAll('.gold-amount').forEach(el => { el.textContent = this.inv.gold; });

        // Announce the held item when the selection (or what's in the selected slot) changes
        const name = this.inv.selectedItem?.name;
        if (this.inv.selected !== this.lastSelected || name !== this.lastSelectedName) {
            showLabel(name ?? 'Empty hand');
            this.lastSelected = this.inv.selected;
            this.lastSelectedName = name;
        }
    }

    get isOpen() { return !this.panel.classList.contains('hidden'); }
    toggle() { this.panel.classList.toggle('hidden'); }
    close() { this.panel.classList.add('hidden'); }
}
