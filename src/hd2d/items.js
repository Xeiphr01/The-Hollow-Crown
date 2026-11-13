// Item definitions (the base types) plus helpers for item *instances*.
//   slot:   'body' | 'head' | 'offhand' — equippable gear (worn in the equipment panel)
//   layer:  sprite-pack layer drawn on the player when worn or held in the hotbar
//   damage / cooldown: melee weapon stats; defense: gear stat; heal: potion; use: special effect
//   tier:   earliest dungeon floor where it drops or the smith stocks it
//   price:  shop buy price (shops buy back at half)
// An instance in the bag is { id, count } plus, for magic items, { rarity: 'magic', prefix, suffix }.
// Gear icons are generated from the sprite layers by tools/make_icons.py. Items with no pack
// art use tiny pixel-art grids drawn to a canvas, one character per pixel.

const ICONS = 'assets/icons/';
const LAYERS = 'assets/sprites/';

function pixelIcon(art, palette) {
    const w = Math.max(...art.map(r => r.length));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = art.length;
    const g = canvas.getContext('2d');
    art.forEach((row, y) => [...row].forEach((ch, x) => {
        if (!palette[ch]) return;
        g.fillStyle = palette[ch];
        g.fillRect(x, y, 1, 1);
    }));
    return canvas.toDataURL();
}

const weapon = (name, file, damage, cooldown, price, tier) => ({
    name, stack: 1, damage, cooldown, price, tier, icon: `${ICONS}${file}`, layer: `${LAYERS}weapons/${file}`,
});
const gear = (name, slot, folder, file, defense, price, tier) => ({
    name, stack: 1, slot, defense, price, tier, icon: `${ICONS}${file}`, layer: `${LAYERS}${folder}/${file}`,
});
// Boss and quest rewards: fixed stats, never sold in shops
const unique = (base, name, bonus) => ({ ...base, name, rarity: 'unique', bonus, tier: 99 });

export const ITEMS = {
    sword:      weapon('Iron Sword', 'Sword_01_Arming_Male.png', 5, 0.6, 30, 1),
    dagger:     weapon('Short Dagger', 'Dagger_01_Short_Male.png', 4, 0.4, 25, 1),
    sickle:     weapon('Rusty Sickle', 'Sickle_01_Rusty_Male.png', 3, 0.5, 15, 1),
    hand_axe:   weapon('Hand Axe', 'Axe_01_Handaxe_Male.png', 6, 0.7, 45, 2),
    scythe:     weapon('Reaper\'s Scythe', 'Scythe_01_Rusty_male.png', 8, 0.8, 70, 3),
    broadsword: weapon('Broadsword', 'Sword_02_Broad_Male.png', 8, 0.65, 90, 3),
    katana:     weapon('Katana', 'Sword_04_Katana_Male.png', 10, 0.55, 160, 4),

    peasant_clothes: gear('Peasant Clothes', 'body', 'armor', 'Peasant_01_Male.png', 0, 15, 1),
    adventurer_garb: gear('Adventurer Garb', 'body', 'armor', 'Adventurer_01_Adventurer_Male.png', 1, 40, 1),
    leather_jerkin:  gear('Leather Jerkin', 'body', 'armor', 'Leather_01_Jerkin_Male.png', 2, 55, 2),
    boiled_leather:  gear('Boiled Leather', 'body', 'armor', 'Leather_02_Cuirboulli_Male.png', 3, 85, 3),
    breastplate:     gear('Steel Breastplate', 'body', 'armor', 'Plate_01_Breastplate_Male.png', 5, 150, 4),
    archer_cap:      gear('Archer Cap', 'head', 'helm', 'Helm_ArcherCap_Male.png', 1, 25, 1),
    wooden_circlet:  gear('Wooden Circlet', 'head', 'helm', 'Helm_WoodenCirclet_Male.png', 1, 30, 2),
    sallet:          gear('Iron Sallet', 'head', 'helm', 'Helm_Sallet_Male.png', 3, 95, 4),
    round_shield:    gear('Round Shield', 'offhand', 'shield', 'Shield_Round_Male.png', 2, 40, 1),
    heater_shield:   gear('Heater Shield', 'offhand', 'shield', 'Shield_HeaterSm_Male.png', 3, 75, 3),

    potion: {
        name: 'Health Potion', stack: 10, heal: 30, price: 15,
        icon: pixelIcon([
            '.....cc.....',
            '.....kk.....',
            '....gkkg....',
            '....g..g....',
            '...grrrrg...',
            '..grrwrrrg..',
            '..grwrrrrg..',
            '..grrrrrrg..',
            '..grrrrrrg..',
            '...grrrrg...',
            '....gggg....',
        ], { c: '#8b5a2b', k: '#d6ebf3', g: '#9fc3d6', r: '#e0374a', w: '#ffb3bd' }),
    },
    slime_gel: {
        name: 'Slime Gel', stack: 99, price: 6,
        icon: pixelIcon([
            '............',
            '............',
            '....gggg....',
            '...gwwggg...',
            '..gwgggggg..',
            '..ggggggdg..',
            '.gggggggddg.',
            '.gggggggddg.',
            '..ddddddddd.',
        ], { g: '#5fd3a0', w: '#d8fff0', d: '#3a9e78' }),
    },
    wolf_pelt: {
        name: 'Wolf Pelt', stack: 99, price: 24,
        icon: pixelIcon([
            '............',
            '..gg....gg..',
            '..gggggggg..',
            '...gllllg...',
            '..gllllllg..',
            '.ggllllllgg.',
            '.g.gllllg.g.',
            '...gllllg...',
            '..gg.gg.gg..',
            '..g..gg..g..',
            '.....gg.....',
        ], { g: '#6e6658', l: '#a39a88' }),
    },
    boar_tusk: {
        name: 'Boar Tusk', stack: 99, price: 30,
        icon: pixelIcon([
            '............',
            '........ww..',
            '.......wwy..',
            '......wwy...',
            '.....wwy....',
            '....wwy.....',
            '...wwy......',
            '..wwy.......',
            '.bwy........',
            '.bb.........',
        ], { w: '#f3ecd2', y: '#cdbf8e', b: '#6b4a2b' }),
    },
    bone: {
        name: 'Old Bone', stack: 99, price: 10,
        icon: pixelIcon([
            '............',
            '.ww.........',
            'wwww........',
            '.wwwd.......',
            '...wwd......',
            '....wwd.....',
            '.....wwd....',
            '......wwd...',
            '.......wwww.',
            '........wwww',
            '.........ww.',
        ], { w: '#efe9d8', d: '#bdb49c' }),
    },

    wardens_oath:       unique(weapon('', 'Sword_03_Ancient_Male.png', 11, 0.6, 320), 'Warden\'s Oath', { hp: 25 }),
    chieftains_cleaver: unique(weapon('', 'Axe_02_Obsidian_Male.png', 14, 0.7, 420), 'Chieftain\'s Cleaver', { damage: 2, hp: 15 }),
    aldrens_bulwark:    unique(gear('', 'offhand', 'shield', 'Shield_06_SunCrest_Male.png', 5, 260), 'Aldren\'s Bulwark', { hp: 30 }),
    hunters_horns:      unique(gear('', 'head', 'helm', 'Helm_Horned_Male.png', 2, 180), 'Hunter\'s Horns', { damage: 2 }),

    return_scroll: {
        name: 'Return Scroll', stack: 10, price: 20, use: 'return',
        icon: pixelIcon([
            '............',
            '.pppppppp...',
            'pllllllllp..',
            '.plbbbblp...',
            '.plllllllp..',
            '.plbbbbblp..',
            '.pllllllp...',
            '.plbbbllp...',
            '..pllllllp..',
            '.pppppppp...',
        ], { p: '#a0703f', l: '#f1e3c0', b: '#4f7fd8' }),
    },
    aldrens_signet: {
        name: 'Aldren\'s Signet', stack: 1, price: 0, quest: true,
        icon: pixelIcon([
            '............',
            '....rrrr....',
            '...rggggr...',
            '...rgRRgr...',
            '...rggggr...',
            '....rrrr....',
            '...y....y...',
            '..y......y..',
            '..y......y..',
            '...y....y...',
            '....yyyy....',
        ], { r: '#8a6d1d', g: '#c9302c', R: '#ff6b6b', y: '#e8c547' }),
    },
};


// --- Magic affixes ---------------------------------------------------------------
// minTier: the earliest floor an affix can roll on. Weapons take damage prefixes, gear takes
// defense prefixes; any item can take a suffix.
const WEAPON_PREFIXES = {
    Sharp:   { damage: 1, minTier: 1 }, Keen: { damage: 2, minTier: 2 },
    Vicious: { damage: 3, minTier: 3 }, Savage: { damage: 5, minTier: 4 },
};
const GEAR_PREFIXES = {
    Sturdy: { defense: 1, minTier: 1 }, Reinforced: { defense: 2, minTier: 2 }, Warded: { defense: 3, minTier: 4 },
};
const SUFFIXES = {
    'of Health':    { hp: 10, minTier: 1 }, 'of the Bear': { hp: 20, minTier: 2 }, 'of the Titan': { hp: 35, minTier: 4 },
    'of Swiftness': { haste: 0.12, minTier: 2, weaponOnly: true },
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const affixes = (inst) => [
    inst.prefix && (WEAPON_PREFIXES[inst.prefix] ?? GEAR_PREFIXES[inst.prefix]),
    inst.suffix && SUFFIXES[inst.suffix],
    ITEMS[inst.id].bonus,
].filter(Boolean);

/** Everything about an instance in one object: base stats + affixes, display name, price. */
export function itemInfo(inst) {
    const base = ITEMS[inst.id];
    const info = { ...base, id: inst.id, count: inst.count ?? 1, rarity: base.rarity ?? inst.rarity ?? 'common', hp: 0 };
    for (const a of affixes(inst)) {
        if (a.damage) info.damage = (info.damage ?? 0) + a.damage;
        if (a.defense) info.defense = (info.defense ?? 0) + a.defense;
        if (a.hp) info.hp += a.hp;
        if (a.haste) info.cooldown = +(info.cooldown * (1 - a.haste)).toFixed(2);
    }
    if (inst.rarity === 'magic') {
        info.name = [inst.prefix, base.name, inst.suffix].filter(Boolean).join(' ');
        info.price = Math.round(base.price * (1.5 + 0.6 * affixes(inst).length));
    }
    return info;
}

export const sellPrice = (inst) => Math.floor((itemInfo(inst).price ?? 0) / 2);

// Plain items of the same kind stack; anything with affixes is one of a kind
export const canStack = (a, b) => a.id === b.id && !a.rarity && !b.rarity && ITEMS[a.id].stack > 1;

/** Tooltip/label text: name plus the stats that matter for that kind of item */
export function describe(info) {
    const stats = [];
    if (info.damage) stats.push(`ATK ${info.damage}`);
    if (info.defense) stats.push(`DEF +${info.defense}`);
    if (info.hp) stats.push(`HP +${info.hp}`);
    if (info.heal) stats.push(`Heals ${info.heal}`);
    return stats.length ? `${info.name} (${stats.join(', ')})` : info.name;
}

export const RARITY_COLORS = { common: '#f3ead8', magic: '#6fa8ff', unique: '#e8b84a' };

const EQUIPMENT_IDS = Object.keys(ITEMS).filter(id => (ITEMS[id].damage || ITEMS[id].slot) && ITEMS[id].tier < 99);

/** Random equipment for dungeon floor / shop tier `tier`; deeper means better bases and more magic. */
export function rollEquipment(tier, magicChance = 0.2 + 0.05 * tier) {
    const id = pick(EQUIPMENT_IDS.filter(i => ITEMS[i].tier <= tier));
    const inst = { id, count: 1 };
    if (Math.random() < magicChance) {
        const isWeapon = Boolean(ITEMS[id].damage);
        const prefixes = Object.entries(isWeapon ? WEAPON_PREFIXES : GEAR_PREFIXES).filter(([, a]) => a.minTier <= tier);
        const suffixes = Object.entries(SUFFIXES).filter(([, a]) => a.minTier <= tier && (isWeapon || !a.weaponOnly));
        const roll = Math.random();
        if (roll < 0.75 && prefixes.length) inst.prefix = pick(prefixes)[0];
        if (roll > 0.4 && suffixes.length) inst.suffix = pick(suffixes)[0];
        if (inst.prefix || inst.suffix) inst.rarity = 'magic';
    }
    return inst;
}
