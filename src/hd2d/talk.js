import { itemInfo, sellPrice, describe, RARITY_COLORS } from './items.js';
import { showLabel } from './ui.js';

// Dialogue box: portrait, name, one line at a time. Space advances; `then` runs after the last line.
// The speaker is an NPC, or null for narration (no portrait).
export class Dialogue {
    constructor() {
        this.el = document.getElementById('dialogue');
        this.nameEl = document.getElementById('dialogue-name');
        this.textEl = document.getElementById('dialogue-text');
        this.portraitEl = document.getElementById('dialogue-portrait');
        this.open = false;
        this.npc = null;
    }

    get isOpen() { return this.open; }

    start(npc, { lines, then, name, title }) {
        this.npc = npc;
        this.lines = lines;
        this.then = then;
        this.index = 0;
        this.open = true;
        if (npc) npc.talking = true;
        this.nameEl.innerHTML = `${name ?? npc?.name ?? ''} <span class="npc-title">${title ?? npc?.def.title ?? ''}</span>`;
        this.portraitEl.replaceChildren(...(npc ? [npc.portrait()] : []));
        this.portraitEl.classList.toggle('hidden', !npc);
        this.el.classList.remove('hidden');
        this.show();
    }

    show() { this.textEl.textContent = this.lines[this.index]; }

    advance() {
        if (++this.index < this.lines.length) return this.show();
        const then = this.then;
        this.close();
        then?.();
    }

    close() {
        if (this.npc) this.npc.talking = false;
        this.npc = null;
        this.open = false;
        this.el.classList.add('hidden');
    }
}

// Buy from a merchant's stock (item instances); sell anything in your bag at half price
export class Shop {
    constructor(inventory) {
        this.inv = inventory;
        this.el = document.getElementById('shop');
        this.titleEl = document.getElementById('shop-title');
        this.buyEl = document.getElementById('shop-buy');
        this.sellEl = document.getElementById('shop-sell');
        this.stock = [];
        document.getElementById('shop-close').addEventListener('click', () => this.close());
        inventory.onChange(() => { if (this.isOpen) this.render(); });
    }

    get isOpen() { return !this.el.classList.contains('hidden'); }

    /** @param stock item instances; plain items restock forever, magic ones sell once */
    open(title, stock) {
        this.titleEl.textContent = title;
        this.stock = stock;
        this.el.classList.remove('hidden');
        this.render();
    }

    close() { this.el.classList.add('hidden'); }

    row(info, label, price, button, enabled, onClick) {
        const row = document.createElement('div');
        row.className = 'shop-row';
        row.innerHTML = `<img src="${info.icon}" alt=""><span class="shop-name" style="color:${RARITY_COLORS[info.rarity]}">${label}</span>`
            + `<span class="shop-price">${price} G</span>`;
        const btn = document.createElement('button');
        btn.textContent = button;
        btn.disabled = !enabled;
        btn.addEventListener('click', onClick);
        row.appendChild(btn);
        return row;
    }

    render() {
        this.buyEl.replaceChildren(...this.stock.map((inst, i) => {
            const info = itemInfo(inst);
            const enabled = this.inv.gold >= info.price && this.inv.hasRoomFor(inst);
            return this.row(info, describe(info), info.price, 'Buy', enabled, () => this.buy(i));
        }));

        const rows = [];
        this.inv.slots.forEach((s, i) => {
            if (!s) return;
            const info = itemInfo(s);
            const label = s.count > 1 ? `${describe(info)} ×${s.count}` : describe(info);
            const price = sellPrice(s);
            rows.push(this.row(info, label, price, info.quest ? 'Keep' : 'Sell', price > 0 && !info.quest, () => this.sell(i)));
        });
        if (!rows.length) rows.push(Object.assign(document.createElement('p'), { className: 'shop-empty', textContent: 'Nothing to sell.' }));
        this.sellEl.replaceChildren(...rows);
    }

    buy(i) {
        const inst = this.stock[i];
        const info = itemInfo(inst);
        if (this.inv.gold < info.price) return showLabel('Not enough gold');
        if (!this.inv.hasRoomFor(inst)) return showLabel('Backpack full');
        this.inv.gold -= info.price;
        if (inst.rarity) this.stock.splice(i, 1); // one of a kind
        this.inv.add({ ...inst, count: 1 }); // triggers a re-render
        showLabel(`Bought ${info.name}`);
    }

    sell(i) {
        const s = this.inv.slots[i];
        if (!s) return;
        this.inv.gold += sellPrice(s);
        showLabel(`Sold ${itemInfo(s).name}`);
        this.inv.removeAt(i);
    }
}
