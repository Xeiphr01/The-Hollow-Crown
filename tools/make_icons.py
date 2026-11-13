"""Generate inventory icons from sprite-pack equipment layers.

The sprite pack only has items as worn/held layers, never as icons. Each layer holds just the
item's pixels, so an icon is the item cut out of one frame and padded to a square.

    python tools/make_icons.py

Reads public/assets/sprites/{weapons,armor,helm,shield}/ and writes public/assets/icons/.
Re-run after copying new equipment layers in.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / 'public' / 'assets' / 'sprites'
OUT = ROOT / 'public' / 'assets' / 'icons'
FRAME = 128

# Held items and shields swing around, so use whichever frame shows the most of them.
# Clothing and helmets read best from the front-facing standing frame.
FOLDERS = {'weapons': 'largest', 'shield': 'largest', 'armor': 'front', 'helm': 'front'}


def frames(img):
    for row in range(4):
        for col in range(5):
            yield img.crop((col * FRAME, row * FRAME, (col + 1) * FRAME, (row + 1) * FRAME))


def pick_frame(img, mode):
    if mode == 'front':
        return img.crop((0, 0, FRAME, FRAME))
    def area(f):
        box = f.getchannel('A').getbbox()
        return 0 if box is None else (box[2] - box[0]) * (box[3] - box[1])
    return max(frames(img), key=area)


def make_icon(path, mode):
    frame = pick_frame(Image.open(path).convert('RGBA'), mode)
    box = frame.getchannel('A').getbbox()
    item = frame.crop(box)
    side = max(item.size) + 4
    icon = Image.new('RGBA', (side, side))
    icon.paste(item, ((side - item.width) // 2, (side - item.height) // 2))
    return icon


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    count = 0
    for folder, mode in FOLDERS.items():
        for path in sorted((SPRITES / folder).glob('*.png')):
            make_icon(path, mode).save(OUT / path.name)
            count += 1
    print(f'Wrote {count} icons to {OUT}')


if __name__ == '__main__':
    main()
