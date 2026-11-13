import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    // Relative paths so the built game works from any folder (itch.io, GitHub Pages, etc.)
    base: './',
    build: {
        rollupOptions: {
            input: {
                main: fileURLToPath(new URL('./index.html', import.meta.url)),
                hd2d: fileURLToPath(new URL('./hd2d.html', import.meta.url)),
            },
        },
    },
});
