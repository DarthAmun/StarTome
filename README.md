# StarTome (rework branch)

An offline-first app for Pathfinder 2e and Starfinder 2e Game Masters: campaign notes, sessions, encounters on a battle map, party and loot, a rules compendium. Everything stays on your device.

This branch is the rework described in [REWORK_PLAN.md](REWORK_PLAN.md). The released app (v0.42) is on `main`; its code is kept here under [`legacy/`](legacy/README.md) until each part is rebuilt.

```bash
pnpm install
pnpm dev            # http://localhost:3001
```

| Command | Does |
|---|---|
| `pnpm lint` | ESLint, including the layer boundaries (`domain` → `data` → `services` → `ui` → `features` → `app`) |
| `pnpm typecheck` | strict TypeScript over `src/` and `tests/` |
| `pnpm test` | unit tests of the new app |
| `pnpm test:legacy` | unit tests of the v0.42 code not ported yet |
| `pnpm test:e2e` | browser tests (Playwright) |
| `pnpm build` | production build into `dist/` |

To run the legacy import against one of your own v0.42 backups:

```bash
STARTOME_LEGACY_EXPORT=~/Downloads/startome-all-2026-11-12.json pnpm test tests/v042/realExport
```

Formats: [campaign authoring](CAMPAIGN_FORMAT.md) and [homebrew](HOMEBREW_FORMAT.md) are unchanged; [backup v3](docs/formats/BACKUP_V3.md) and [quest board v2](docs/formats/QUESTBOARD_V2.md) are new.

StarTome is unofficial and not affiliated with Paizo Inc. Pathfinder and Starfinder are trademarks of Paizo Inc.
