export const keys = { w: false, a: false, s: false, d: false, shift: false, e: false, 1: false, 2: false, 3: false, 4: false, 5: false, r: false };
export const mouse = { left: false, right: false };
export const justPressed = { e: false, r: false };

window.addEventListener('keydown', (e) => {
    let k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) {
        if (!keys[k] && justPressed.hasOwnProperty(k)) justPressed[k] = true;
        keys[k] = true;
    }
});
window.addEventListener('keyup', (e) => {
    let k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
});
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) mouse.right = true;
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
});
window.addEventListener('contextmenu', e => e.preventDefault());