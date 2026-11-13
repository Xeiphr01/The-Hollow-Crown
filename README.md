# Isekai Farm RPG

## Run it
```
npm install     # first time only
npm run dev     # opens a local server with instant reload
```

## Build for sharing
```
npm run build   # outputs a ready-to-upload game in dist/
```

Sprites live in `public/assets/images/`. Frame counts per sheet are set in each entity's
`animations` table; `frames` can be a single number or an array (one count per row).
