// The people of Willowbrook. Each NPC is a stack of sprite-pack layers (bottom to top) plus behaviour.
//   talk(ctx)   → { lines, then? } — `then` runs after the last line
//   marker(ctx) → '!' (has a quest for you), '?' (quest ready to hand in) or null
// ctx: { player, inventory, quests, flags, give, giveGold, grantXp, healFull, openShop, boostMaxHp, lorePages }
// Tiles are [col, row] on the outskirts map; patrol waypoints too.

const S = 'assets/sprites/';
const pick = (list) => list[Math.floor(Math.random() * list.length)];

const CHICKEN_ROWS = { down: 0, right: 1, left: 2, up: 3 }; // this sheet's side rows are swapped
const chicken = (id, col, row) => ({
    id, sprite: 'chicken', layers: [`${S}animals/Chicken.png`], rows: CHICKEN_ROWS,
    tile: [col, row], behavior: 'wander', radius: 1.5, speed: 0.8, stepSpeed: 0.12, feetPx: 114,
});

// Chain several dialogue results into one conversation
const join = (...parts) => {
    const real = parts.filter(Boolean);
    return {
        lines: real.flatMap(p => p.lines),
        then: () => real.forEach(p => p.then?.()),
    };
};

export const NPC_DEFS = [
    {
        id: 'elin', name: 'Sister Elin', title: 'Priestess', tile: [39, 36], behavior: 'stand', facing: 'down',
        layers: [
            `${S}humanoid/Template_Female.png`, `${S}armor/Cleric_02_Acolyte_Female.png`,
            `${S}helm/Helm_PrayerCap_Female.png`, `${S}weapons/Goblet_01_Sacramental_female.png`,
        ],
        marker: ({ quests: q }) => (q.is('silent_bell', 'ready') || q.is('gravewarden', 'ready') ? '?'
            : !q.status('silent_bell') || (q.is('silent_bell', 'done') && !q.status('gravewarden')) ? '!' : null),
        talk: (ctx) => {
            const { quests: q, player } = ctx;
            const heal = player.health < player.maxHealth
                ? { lines: ['Hold still. Light of the morning bell, mend what was broken...'], then: ctx.healFull } : null;

            if (!q.status('silent_bell')) {
                return join(heal, {
                    lines: ['A stranger, soaked through and shivering. You washed up on the beach, didn\'t you?',
                        'Then you came at a bad time. Three weeks ago our chapel bell went silent. That same night, Abbot Varric went down into the crypt and never came back.',
                        'Now the dead walk in the graveyard after dark, and the goblins in the hills grow bold.',
                        'The crypt is at the north end of the graveyard. Beneath it lies the Sunken Abbey. Will you go down and find out what happened?',
                        'Bram sells potions and return scrolls. Hilda can arm you. And come back to me whenever you are hurt.'],
                    then: () => q.start('silent_bell'),
                });
            }
            if (q.is('silent_bell', 'ready')) {
                return join(heal, {
                    lines: ['You went down there... and came back. That is more than the abbot managed.',
                        'Something has been sealed in that abbey since the village was founded. Something with a guardian.',
                        'The old texts speak of a Gravewarden on the second floor, set to watch over the dead. If it has woken, nothing will rest until it falls.',
                        'Take this, for your trouble. And be careful.'],
                    then: () => { q.complete('silent_bell'); ctx.giveGold(60); ctx.give('potion', 3); q.start('gravewarden'); },
                });
            }
            if (q.is('gravewarden', 'ready')) {
                return join(heal, {
                    lines: ['The Gravewarden destroyed? Then whatever it was guarding is no longer guarded.',
                        'That frightens me more than the warden did.',
                        'Old Tomas has been reading the founders\' records. Go to him. He will know what lies further down.'],
                    then: () => { q.complete('gravewarden'); ctx.giveGold(150); },
                });
            }
            if (q.is('chieftain', 'done')) {
                return join(heal, { lines: ['The chieftain is dead, and the bell still does not ring.',
                    'Tomas says there is a sealed door below the Warrens. Whatever wears that crown is waiting behind it.',
                    'When you are ready to open it, the whole village will be praying for you.'] });
            }
            return heal ?? { lines: [pick(['The bell has not rung in three weeks. I still listen for it every morning.',
                'Come back whenever you are hurt. The light does not run out.'])] };
        },
    },
    {
        id: 'tomas', name: 'Old Tomas', title: 'Sage', tile: [34, 39], behavior: 'stand', facing: 'down',
        layers: [
            `${S}humanoid/Template_Male_Dark.png`, `${S}armor/Mage_02_Wizard_Male.png`,
            `${S}hair/BeardWhite.png`, `${S}helm/Helm_Mage_Male.png`, `${S}weapons/Staff_GnarledVenerable_Male.png`,
        ],
        marker: ({ quests: q, lorePages }) => {
            if (['whispers_below', 'chieftain', 'lost_pages'].some(id => q.is(id, 'ready'))) return '?';
            if (q.is('lost_pages', 'active') && lorePages() >= 4) return '?';
            if (!q.status('lost_pages') || (q.is('gravewarden', 'done') && !q.status('whispers_below'))
                || (q.is('whispers_below', 'done') && !q.status('chieftain'))) return '!';
            return null;
        },
        talk: (ctx) => {
            const { quests: q } = ctx;
            const pages = ctx.lorePages();
            if (q.is('lost_pages', 'active') && pages >= 4) q.ready('lost_pages');
            if (q.is('lost_pages', 'ready')) {
                return {
                    lines: ['All four pages. Let me read them... Oh. Oh, Varric.',
                        '"The founders did not build an abbey. They built a lid." He was right. I should have seen it.',
                        'The Hollow King\'s crown pulls souls across from other worlds. You are its latest catch, and it will not stop calling.',
                        'Take this blessing. It is an old one, and it will keep you standing a little longer down there.'],
                    then: () => { q.complete('lost_pages'); ctx.boostMaxHp(20); ctx.grantXp(200); },
                };
            }
            if (q.is('gravewarden', 'done') && !q.status('whispers_below')) {
                return {
                    lines: ['So the Gravewarden is gone. Then the founders\' seal is broken.',
                        'Below the ossuary, the abbey gives way to old tunnels. The goblins have dug into them from the hills. They call them the Warrens.',
                        'Go down. Find out what draws them there.'],
                    then: () => q.start('whispers_below'),
                };
            }
            if (q.is('whispers_below', 'ready')) {
                return {
                    lines: ['The Warrens. And the goblins are not just living there; they are worshipping something.',
                        'Their chieftain guards a sealed door on the next floor down. Kill him, and we will see what he was protecting.',
                        'Take these scrolls. Read one and it will carry you home.'],
                    then: () => { q.complete('whispers_below'); ctx.giveGold(100); ctx.give('return_scroll', 3); q.start('chieftain'); },
                };
            }
            if (q.is('chieftain', 'ready')) {
                return {
                    lines: ['The Chieftain is dead? Then nothing stands between us and that door except the door itself.',
                        'It is sealed with the crown\'s own power. I will need time to find a way through it.',
                        'Rest. Gather your strength. When the way opens, the Hollow King will be waiting.',
                        '(The story continues in the next update.)'],
                    then: () => { q.complete('chieftain'); ctx.giveGold(250); },
                };
            }
            if (!q.status('lost_pages')) {
                return {
                    lines: ['Ah, the stranger from the beach. Sit, sit. My eyes are poor but my ears are fine.',
                        'Abbot Varric kept a journal. He took it down with him. If the pages survived, they will tell us what he found.',
                        'There should be one on every floor of the abbey. Bring them to me.'],
                    then: () => q.start('lost_pages'),
                };
            }
            return { lines: [pages ? `You have found ${pages} of the abbot's four pages. Keep looking.`
                : pick(['The founders came here from across the sea. Or so they claimed. The records are strangely quiet about it.',
                    'Two moons in the sky, and you do not even blink at it. Wherever you came from, it was not here.'])] };
        },
    },
    {
        id: 'bram', name: 'Bram', title: 'Merchant', tile: [25, 36], behavior: 'stand', facing: 'down',
        layers: [
            `${S}humanoid/Template_Male.png`, `${S}armor/Student_02_Philosopher_Male.png`,
            `${S}hair/BaldWhite.png`, `${S}hair/BeardWhite.png`, `${S}helm/Helm_Bowler_Male.png`,
        ],
        talk: (ctx) => ({
            lines: ctx.flags.metBram
                ? [pick(['Potions, scrolls, and fair prices for whatever you drag out of that hole.',
                    'Back in one piece! Good for you, good for business.'])]
                : ['Welcome to Bram\'s Goods! Potions to keep you breathing, scrolls to bring you home.',
                    'And I buy anything you haul out of the abbey. Bones, pelts, cursed swords, no questions asked.'],
            then: () => { ctx.flags.metBram = true; ctx.openShop('general'); },
        }),
    },
    {
        id: 'hilda', name: 'Hilda', title: 'Blacksmith', tile: [27, 38], behavior: 'stand', facing: 'down',
        layers: [
            `${S}hair/Hair_Pigtails_Black_Rear.png`, `${S}humanoid/Template_Female_Tan.png`,
            `${S}armor/Barbarian_01_Nomad_Female.png`, `${S}hair/Hair_Pigtails_Black_Front.png`,
            `${S}weapons/Greathammer_01_Sledge_Female.png`,
        ],
        talk: (ctx) => ({
            lines: ctx.flags.metHilda
                ? [pick(['New stock\'s in. Deeper you go, the better the steel I can get.',
                    'Bring me gold, I\'ll bring you an edge.'])]
                : ['You\'re going down into the abbey in THAT? Gods, sit down before you hurt yourself.',
                    'I forge what I can and trade for the rest. The deeper you go, the better the steel I\'ll find for you. Prices aren\'t cheap. Neither is a funeral.'],
            then: () => { ctx.flags.metHilda = true; ctx.openShop('smith'); },
        }),
    },
    {
        id: 'marta', name: 'Marta', title: 'Widow', tile: [21, 44], behavior: 'wander', radius: 1.2, speed: 0.7,
        layers: [
            `${S}hair/Hair_Short_Brown_Rear.png`, `${S}humanoid/Template_Female.png`,
            `${S}armor/Peasant_02_Female.png`, `${S}hair/Hair_Short_Brown_Front.png`,
        ],
        marker: ({ flags }) => (flags.gotScrolls ? null : '!'),
        talk: (ctx) => ctx.flags.gotScrolls
            ? { lines: [pick([
                'My husband went into that crypt as a boy, on a dare. He came out white as milk and never said why.',
                'The chickens won\'t lay since the bell stopped. Clucky, Pebble, Sir Feathers... not one egg.',
                'Garrick hasn\'t slept since his brother went down there. Be kind to him.',
            ])] }
            : {
                lines: ['You\'re the one going into the abbey? Then take these. My late husband\'s.',
                    'Return scrolls. Read one down there and it will carry you home. He swore by them.'],
                then: () => { if (ctx.give('return_scroll', 2)) ctx.flags.gotScrolls = true; },
            },
    },
    {
        id: 'garrick', name: 'Garrick', title: 'Village Guard', behavior: 'patrol', speed: 1.3,
        tile: [32, 31], waypoints: [[32, 31], [32, 14]],
        layers: [
            `${S}humanoid/Template_Male_Tan.png`, `${S}armor/Plate_01_Breastplate_Male.png`,
            `${S}hair/HairCaesarBlack.png`, `${S}helm/Helm_Guard_Male.png`,
            `${S}shield/Shield_Round_Male.png`, `${S}weapons/Sword_02_Broad_Male.png`,
        ],
        marker: ({ quests: q }) => (q.is('signet', 'ready') ? '?' : !q.status('signet') ? '!' : null),
        talk: (ctx) => {
            const { quests: q } = ctx;
            if (q.is('signet', 'ready')) {
                return {
                    lines: ['That\'s... that\'s his ring. Aldren\'s.',
                        '...',
                        'Thank you. At least now I know.',
                        'Take his shield. He\'d have wanted it to go back down there, with someone who\'ll come back up.'],
                    then: () => { ctx.inventory.removeId('aldrens_signet'); q.complete('signet'); ctx.give({ id: 'aldrens_bulwark' }); ctx.grantXp(150); },
                };
            }
            if (!q.status('signet')) {
                return {
                    lines: ['You\'re going into the abbey? Then listen.',
                        'My brother Aldren took the first patrol down, the night the bell stopped. Six men. None came back.',
                        'If you find him... if you find anything of his, his signet ring, bring it to me. I need to know.'],
                    then: () => q.start('signet'),
                };
            }
            return { lines: pick([
                ['Slimes in the meadow, wolves in the woods, goblins in the hills. And worse under the graveyard.'],
                ['Armor\'s worth every coin. Hilda\'s prices hurt less than a skeleton\'s sword.'],
                ['Still nothing of Aldren\'s? Keep looking. Please.'],
            ]) };
        },
    },
    {
        id: 'wren', name: 'Wren', title: 'Hunter', tile: [18, 39], behavior: 'stand', facing: 'down',
        layers: [
            `${S}humanoid/Template_Male_Dark.png`, `${S}armor/Leather_01_Jerkin_Male.png`,
            `${S}hair/HairCaesarBlond.png`, `${S}helm/Helm_ArcherCap_Male.png`,
        ],
        marker: ({ quests: q }) => (q.is('alpha', 'ready') ? '?' : !q.status('alpha') ? '!' : null),
        talk: (ctx) => {
            const { quests: q } = ctx;
            if (q.is('alpha', 'ready')) {
                return {
                    lines: ['You killed it? The Alpha? Ha! I owe you a drink and more.',
                        'Here. I made these from the last big one I took down. They\'ll suit you better than me.'],
                    then: () => { q.complete('alpha'); ctx.give({ id: 'hunters_horns' }); ctx.giveGold(80); },
                };
            }
            if (!q.status('alpha')) {
                return {
                    lines: ['Whisperwood\'s gone wrong since the bell stopped. The wolves hunt in packs now, led by a black brute bigger than a pony.',
                        'Kill the Alpha and the packs will scatter. Make it worth your while, too.',
                        'Find it in the forest west of here. Bring potions.'],
                    then: () => q.start('alpha'),
                };
            }
            return { lines: pick([
                ['Boars in the Eastern Fields hit like a runaway cart. Don\'t trade blows at low health.'],
                ['Goblins have a camp in the hills north-east. Mean little things, and they hoard gold.'],
                ['Wolf pelts sell well at Bram\'s if you\'re short on coin.'],
            ]) };
        },
    },
    {
        id: 'pip', name: 'Pip', title: 'Village Kid', tile: [32, 41], behavior: 'wander', radius: 2.5, speed: 1.5,
        stepSpeed: 0.13, feetPx: 124,
        layers: [
            `${S}child/ChildShortOrangeRear.png`, `${S}child/Template_Child.png`,
            `${S}child/Kimono_Child.png`, `${S}child/ChildShortOrangeFront.png`,
        ],
        talk: () => ({ lines: [pick([
            'Are you gonna kill the skeletons? Can I have a bone?',
            'Mina says if you listen at the crypt door you can hear someone singing. I\'m not scared. I just don\'t want to.',
            'When I grow up I\'m gonna be a guard like Garrick. But with TWO swords.',
        ])] }),
    },
    {
        id: 'mina', name: 'Mina', title: 'Village Kid', tile: [30, 45], behavior: 'wander', radius: 2, speed: 1.3,
        stepSpeed: 0.13, feetPx: 124,
        layers: [
            `${S}child/ChildShortBlackRear.png`, `${S}child/Template_Child_Tan.png`,
            `${S}child/Kimono_Child_Pink.png`, `${S}child/ChildShortBlackFront.png`,
        ],
        talk: () => ({ lines: [pick([
            'You talk funny. Are you from the other side of the sea?',
            'At night the crypt hums. Like a song with no words.',
            'Sister Elin can fix any scrape. Even big ones!',
        ])] }),
    },
    chicken('clucky', 18, 35),
    chicken('pebble', 20, 36),
    chicken('sir_feathers', 19, 37),
    {
        id: 'horse', layers: [`${S}animals/Horse.png`], tile: [35, 46], behavior: 'wander',
        radius: 1.5, speed: 0.6, feetPx: 124,
    },
];
