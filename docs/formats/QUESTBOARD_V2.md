# StarTome quest board export, version 2 (draft)

Status: **draft, part of REWORK_PLAN.md; not implemented.** Version 1 is what v0.41 writes (`converters/export.ts`, `buildQuestBoard`).

A player-safe list of a campaign's quests: GM-only blocks (`> [!hidden]`) are removed from the description and the reward, and `{{item: Name}}` references in either are resolved against the compendium.

## File

`startome-questboard-<campaign>-<YYYY-MM-DD>.json`

```json
{
  "version": 2,
  "app": "startome",
  "type": "questboard",
  "exportedAt": "2026-11-12T19:04:05.000Z",
  "campaign": { "id": "0192f3a1-7c1e-7b3a-9d2e-3f5a6b7c8d9e", "name": "The Codex", "game": "pf2e" },
  "quests": [
    {
      "id": "0192f3a2-11aa-7c44-8e21-0a1b2c3d4e5f",
      "name": "The Lost Seal",
      "status": "active",
      "giver": "Elder Maren",
      "description": "Markdown, GM-only blocks removed.",
      "reward": "200 gp and a {{item: Healing Potion (Lesser)}}",
      "rewardItems": [
        {
          "name": "Healing Potion (Lesser)",
          "compendiumId": "fvtt:pf2e:equipment-srd:…",
          "level": 3,
          "price": { "cp": 1200 },
          "rarity": "common",
          "traits": ["consumable", "healing", "magical", "potion"]
        }
      ]
    }
  ]
}
```

## Changes from version 1

| Field | Version 1 | Version 2 |
|---|---|---|
| `version` | `1` | `2` |
| `quests[].id` | number (database row id, different after every import) | string (UUID v7, stable for the life of the quest, across backups and devices) |
| `campaign.id` | not present | string, so a reader can tell two campaigns of the same name apart |

Everything else is unchanged: `status` is `active`, `completed`, `failed`, `dormant` or `null`; `giver` and `status` may be `null`; an item reference that matches no compendium entry appears in `rewardItems` with its name and `null` / `[]` for the rest; prices are in copper (1 credit = 10 cp in SF2e).

## What breaks for a reader

- A reader that parses `quests[].id` as a number fails. One that uses it as an opaque key works unchanged, and gains ids that no longer change between exports.
- A reader that checks `version === 1` must accept `2`.
