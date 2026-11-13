// Item definitions. Icons are tiny pixel-art grids drawn to a canvas, one character per pixel;
// replace `icon` with a PNG path once there's real item art.

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

export const ITEMS = {
    sword: {
        name: 'Iron Sword', stack: 1, weapon: 'sword',
        icon: pixelIcon([
            '...........s',
            '..........sd',
            '.........sd.',
            '........sd..',
            '.......sd...',
            '......sd....',
            '.gg..sd.....',
            '..ggsd......',
            '...gg.......',
            '..h.gg......',
            '.hh.........',
            'oh..........',
        ], { s: '#eef3f8', d: '#8f9cad', g: '#d4a62a', h: '#8b5a2b', o: '#d4a62a' }),
    },
    hoe: {
        name: 'Hoe', stack: 1,
        icon: pixelIcon([
            '.......mmmm.',
            '.......mmmmm',
            '.......hmm..',
            '......hh....',
            '.....hh.....',
            '....hh......',
            '...hh.......',
            '..hh........',
            '.hh.........',
            'hh..........',
        ], { m: '#9aa6b2', h: '#a0703f' }),
    },
    turnip_seeds: {
        name: 'Turnip Seeds', stack: 99,
        icon: pixelIcon([
            '....tt......',
            '...t..t.....',
            '....bb......',
            '...bbbb.....',
            '..bbbbbb....',
            '.bbllbbbb...',
            '.blbbbbbb...',
            '.bbbbbbbb...',
            '..bbbbbb....',
            '...bbbb..y..',
            '.........y.y',
        ], { b: '#c49a5a', l: '#e8cb94', t: '#7a4f2a', y: '#f2d16b' }),
    },
    potion: {
        name: 'Health Potion', stack: 10, heal: 30,
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
        name: 'Slime Gel', stack: 99,
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
};
