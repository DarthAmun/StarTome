# StarTome — PWA Setup

## Local Development

```bash
pnpm install
pnpm dev
```

Open http://localhost:3001 — the app runs entirely in the browser.
Data is stored in IndexedDB (persists across sessions).

## Build for Production

```bash
pnpm generate
```

Output goes to `.output/public/` — a fully static site, no server needed.

## Deploy to GitHub Pages

1. Push this repo to GitHub
2. Go to **Settings → Pages → Source** → select **GitHub Actions**
3. Edit `.github/workflows/nuxtjs.yml` and set `NUXT_APP_BASE_URL` to match your repo name:
   ```yaml
   NUXT_APP_BASE_URL: /your-repo-name/
   ```
4. Push to `main` — the workflow builds and deploys automatically.
5. Your app is live at `https://your-username.github.io/your-repo-name/`

## PWA Icons

Replace the placeholder icons in `public/icons/` with real PNG files:
- `icon-192.png` — 192×192px
- `icon-512.png` — 512×512px

Generate from the included SVG:
```bash
# Using Inkscape
inkscape public/icons/icon.svg -w 192 -h 192 -o public/icons/icon-192.png
inkscape public/icons/icon.svg -w 512 -h 512 -o public/icons/icon-512.png

# Or using ImageMagick
convert -background none public/icons/icon.svg -resize 192x192 public/icons/icon-192.png
convert -background none public/icons/icon.svg -resize 512x512 public/icons/icon-512.png
```

## Data & Backups

All data lives in your browser's IndexedDB in the database `startome`.

**To back up**: Open DevTools → Application → IndexedDB → startome → export
**Location**: Chrome stores it in `~/.config/chromium/Default/IndexedDB/`

For a proper backup/restore feature this can be added later using the Dexie export/import plugin.

## Key Differences from Electron Version

| Feature | Electron | PWA |
|---------|----------|-----|
| Database | SQLite file | IndexedDB (Dexie) |
| Images | File paths on disk | Base64 data URLs in IndexedDB |
| Player window | Electron BrowserWindow | `window.open()` + BroadcastChannel |
| File picker | Native OS dialog | Browser `<input type="file">` |
| Offline | Always | Service Worker cache |
| Updates | Manual rebuild | Auto-detected on refresh |
