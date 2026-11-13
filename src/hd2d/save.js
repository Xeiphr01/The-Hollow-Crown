// Autosave in the browser. Stored per browser and per site, so clearing site data deletes it.
const KEY = 'hollow-crown-save-v1';

export function loadSave() {
    try {
        return JSON.parse(localStorage.getItem(KEY));
    } catch {
        return null; // storage blocked (private window) or corrupt: start fresh
    }
}

export function writeSave(data) {
    try {
        localStorage.setItem(KEY, JSON.stringify(data));
        return true;
    } catch {
        return false;
    }
}

export function clearSave() {
    try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
