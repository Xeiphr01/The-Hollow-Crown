// The story: quests, the abbot's journal pages, and the quest log.
// A quest moves through: (not started) → active → ready (objective done, return to the giver) → done.

export const QUESTS = {
    silent_bell: {
        title: 'The Silent Bell', giver: 'Sister Elin', main: true,
        active: 'Find the crypt in the Old Graveyard, north of the village, and descend into the Sunken Abbey.',
        ready: 'You have entered the abbey. Return to Sister Elin.',
    },
    gravewarden: {
        title: 'The Gravewarden', giver: 'Sister Elin', main: true,
        active: 'Something guards the abbey\'s ossuary on the second floor. Destroy it.',
        ready: 'The Gravewarden has fallen. Tell Sister Elin.',
    },
    whispers_below: {
        title: 'Whispers Below', giver: 'Old Tomas', main: true,
        active: 'Go deeper. Reach the third floor of the abbey, where the goblins have dug in.',
        ready: 'You found the Goblin Warrens. Report to Old Tomas.',
    },
    chieftain: {
        title: 'The Chieftain\'s Tribute', giver: 'Old Tomas', main: true,
        active: 'The Goblin Chieftain guards a sealed door on the fourth floor. Kill him.',
        ready: 'The Chieftain is dead. Return to Old Tomas.',
    },
    alpha: {
        title: 'The Alpha', giver: 'Wren',
        active: 'An Alpha Wolf leads the packs of Whisperwood, west of the village. Hunt it down.',
        ready: 'The Alpha is dead. Bring word to Wren.',
    },
    signet: {
        title: 'Aldren\'s Signet', giver: 'Garrick',
        active: 'Garrick\'s brother Aldren led the first patrol into the abbey and never returned. Find his signet ring. Garrick fears it lies as deep as the Warrens.',
        ready: 'You found Aldren\'s Signet. Give it to Garrick.',
    },
    lost_pages: {
        title: 'The Abbot\'s Journal', giver: 'Old Tomas',
        active: 'Abbot Varric kept a journal. Find its four lost pages in the abbey (one per floor) and bring them to Tomas.',
        ready: 'You have all four pages. Bring them to Old Tomas.',
    },
};

// One page waits on each floor; picking one up shows it right away
export const LORE = {
    1: ['Day one. The bell has gone silent and no one can say why.',
        'Beneath the crypt I found steps that no map of this village records. The air below smells of iron and old candles.',
        'I am taking a lamp and going down. — Varric'],
    2: ['The founders did not build an abbey. They built a lid.',
        'Every carving down here tells the same story: a king who wore a crown of hollow gold, and who called people out of other worlds to serve him.',
        'They buried him alive, crown and all, and set a warden over the grave.'],
    3: ['The goblins worship it. They leave offerings at a sealed door below: bones, coins, and once, a living man.',
        'I heard the crown speak through that door. It knew my name.',
        'It knew yours too, stranger, whoever you are.'],
    4: ['I understand now. The crown cannot leave its tomb, so it brings others in.',
        'Every soul it drags across from another world makes it stronger, and the latest one washed up on our beach.',
        'If you are reading this, you came from somewhere else. Do not let it finish what it started. — V.'],
};

export const INTRO = [
    'Salt. Cold sand. The sound of a bell that isn\'t ringing.',
    'You wake on a beach you have never seen, beneath a sky with two pale moons.',
    'You remember your name, but not your world. Only a voice, fading as you wake: "Come down to me."',
    'Inland, the rooftops of a village. Someone there will know where you are.',
];

export class QuestLog {
    constructor() {
        this.state = {}; // id → 'active' | 'ready' | 'done'
        this.listeners = [];
    }

    onChange(fn) { this.listeners.push(fn); }
    changed() { this.listeners.forEach(fn => fn()); }

    status(id) { return this.state[id] ?? null; }
    is(id, status) { return this.state[id] === status; }

    start(id) {
        if (this.state[id]) return false;
        this.state[id] = 'active';
        this.changed();
        return true;
    }

    // Objective met; still needs handing in
    ready(id) {
        if (this.state[id] !== 'active') return false;
        this.state[id] = 'ready';
        this.changed();
        return true;
    }

    complete(id) {
        this.state[id] = 'done';
        this.changed();
    }

    toJSON() { return this.state; }
    load(data) { this.state = { ...data }; this.changed(); }
}

// The quest log panel (Q)
export class QuestLogUI {
    constructor(log) {
        this.log = log;
        this.panel = document.getElementById('quest-log');
        this.list = document.getElementById('quest-list');
        log.onChange(() => this.render());
        this.render();
    }

    render() {
        const entries = Object.entries(this.log.state);
        const order = { ready: 0, active: 1, done: 2 };
        entries.sort(([a, sa], [b, sb]) => order[sa] - order[sb] || (QUESTS[b].main ? 1 : 0) - (QUESTS[a].main ? 1 : 0));
        if (!entries.length) {
            this.list.innerHTML = '<p class="quest-empty">No quests yet. Talk to the people of Willowbrook.</p>';
            return;
        }
        this.list.innerHTML = entries.map(([id, status]) => {
            const q = QUESTS[id];
            const text = status === 'done' ? 'Completed.' : q[status];
            return `<div class="quest ${status}"><div class="quest-title">${q.main ? '&#9733; ' : ''}${q.title}`
                + `<span class="quest-giver">${q.giver}</span></div><div class="quest-text">${text}</div></div>`;
        }).join('');
    }

    get isOpen() { return !this.panel.classList.contains('hidden'); }
    toggle() { this.panel.classList.toggle('hidden'); }
    close() { this.panel.classList.add('hidden'); }
}
