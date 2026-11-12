# StarTome backup format, version 3 (draft)

Status: **draft, part of REWORK_PLAN.md; not implemented.** Replaces the single-JSON `version: 2` file written by v0.41 (`sync/backup.ts`). Version 2 files remain importable through the legacy import.

## Why it changes

A version 2 backup is one JSON document with every image as a base64 data URL. A real backup is 578 MB, 430 MB of it images inflated by a third, and past the 512 MB limit on a single string, which needs a special streaming parser. Version 3 is a zip: rows as text, images as the binary files they are.

## Container

A zip file named `startome-<scope>-<YYYY-MM-DD>.startome.zip`. Entries are stored without compression for `images/` (WebP and JPEG are already compressed) and deflated for everything else. The file is written and read as a stream; no part of it has to fit in memory as one string.

```
manifest.json
data/campaigns.ndjson
data/entries.ndjson
data/links.ndjson
data/…one file per collection…
images/index.ndjson
images/<imageId>.<ext>
```

## manifest.json

```json
{
  "format": "startome-backup",
  "version": 3,
  "schemaVersion": 1,
  "app": "startome",
  "appVersion": "1.0.0",
  "exportedAt": "2026-11-12T19:04:05.000Z",
  "scope": "all",
  "campaignIds": null,
  "collections": { "campaigns": 2, "entries": 292, "images": 2424 }
}
```

| Field | Meaning |
|---|---|
| `format` | Always `"startome-backup"`. A zip without it is not a backup. |
| `version` | Container version, `3`. Changes only if this layout changes. |
| `schemaVersion` | Version of the row shapes inside `data/`. An importer migrates older rows forward with the app's numbered migrations and refuses a newer one with a clear message. |
| `scope` | `"all"`: everything. `"campaigns"`: the campaigns in `campaignIds` with what they reference. `"homebrew"` is **not** a scope: homebrew packs keep their own JSON format (HOMEBREW_FORMAT.md). |
| `campaignIds` | The campaign ids for scope `"campaigns"`, else `null`. |
| `collections` | Row count per file, checked on import. |

## data/*.ndjson

One file per collection, one JSON object per line (newline-delimited JSON), UTF-8. A collection without rows has no file.

Rows are exactly the rows of the database at `schemaVersion`: `camelCase` keys, string ids (UUID v7), ISO 8601 UTC timestamps, real booleans, structured values as JSON values. References are ids. Images are referenced as `{ "imageId": "<id>" }` or `{ "url": "https://…" }`; no data URLs appear anywhere in `data/`.

Collections at schema version 1 (see REWORK_PLAN.md section 9 for what each holds):

| File | Scope `all` | Scope `campaigns` |
|---|---|---|
| `campaigns`, `entries`, `links`, `entryVersions`, `mapPins`, `graphs`, `graphEdges`, `sessionPanels`, `sessionEdges`, `encounters`, `combatants`, `encounterMaps`, `combatLog`, `characters`, `partyLedger`, `inventory`, `purses`, `starships`, `workspace` | all rows | rows of the chosen campaigns |
| `actors` (token library), `mapAssets` | all rows | only those the chosen campaigns use |
| `rules` | own entries (origin `user` or `legacy`) in full | not included |
| `rulesOverlays` | user-owned fields of synced entries: `{ id, img?, tokenImg?, gmNotes?, tags?, isFavorite?, style?, localEdits?, unidentified? }` | not included |
| `syncState` | which Foundry release each game was synced from | not included |
| `soundTracks`, `soundPlaylists` | all rows; a local-file track carries its file name, not the file | not included |
| `settings` | app settings | not included |

Never included: synced compendium content (sync it again; `syncState` says which release), image thumbnails, the character-app pairing token, pending offers in the outbox, device preferences.

## images/

`images/index.ndjson` has one line per image:

```json
{ "id": "0192f3a1-…", "mime": "image/webp", "file": "0192f3a1-….webp", "bytes": 183422, "sha256": "…" }
```

`images/<file>` is the image's bytes. Only images referenced by a row in `data/` are written.

## Import

- **Restore** (scope `all` only): the database is emptied and the rows are written as they are. Synced compendium entries are kept; overlays are applied to those present, and the ones without a synced entry are reported.
- **Add** (any scope): rows are written beside what is there. Ids are globally unique, so nothing is renumbered. A row whose id already exists is skipped and counted, which makes importing the same file twice harmless. "Import as a copy" gives the campaigns and everything under them new ids.

Both run in one transaction after the whole file has been read and validated against the schemas: a failure leaves the database as it was. The result lists rows written, skipped and rejected per collection.

## Backup folder

The automatic backup writes the same layout into a folder instead of a zip, so that an image already present is not written again: `manifest.json` and `data/` are replaced each time, `images/` only grows (and is pruned of files no manifest of the kept backups references). Zipping that folder gives a valid version 3 backup.

## What breaks for readers of version 2

Only StarTome reads backups. A script that opened a version 2 file with `json.load` needs to read `data/<collection>.ndjson` line by line instead, and finds new collection names and `camelCase` keys (REWORK_PLAN.md section 9 has the mapping). The campaign authoring format (CAMPAIGN_FORMAT.md) and the homebrew format (HOMEBREW_FORMAT.md) are separate, unchanged, and still plain JSON.
