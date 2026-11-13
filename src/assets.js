// Shared image cache: every entity using the same sprite sheet gets the same Image object.
const cache = new Map();

export function getImage(src) {
    if (!cache.has(src)) {
        const img = new Image();
        img.src = src;
        cache.set(src, img);
    }
    return cache.get(src);
}

// Load every animation's sheet into the cache and attach it as anim.img.
export function loadAnimations(animations) {
    for (const k in animations) animations[k].img = getImage(animations[k].src);
}

// `frames` is either one number for every row, or an array with a count per row.
export function frameCount(anim, row) {
    return Array.isArray(anim.frames) ? anim.frames[row] : anim.frames;
}
