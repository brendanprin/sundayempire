# 2026 Mock Rookie Class Extract

Source files:
- `/Users/brendanprin/Downloads/dynasty_2026_mock_rookie_class_full.csv`
- `/Users/brendanprin/Downloads/dynasty_2026_mock_rookie_class_minimal.csv`

Created output:
- `prisma/data/mock-rookie-class-2026-canonical.csv`
- `prisma/data/mock-rookie-class-2026-import.csv`

Why there are two files:
- `mock-rookie-class-2026-canonical.csv` preserves the full 257-player mock class with source and pick metadata plus normalized import-friendly fields.
- `mock-rookie-class-2026-import.csv` is the smaller 86-player fantasy-only subset that the current manual player importer can ingest without row errors.

Why the import file is smaller:
- The current manual player importer accepts `name`, `position`, `nflTeam`, `yearsPro`, source identity fields, and a few status fields.
- The importer only accepts fantasy positions: `QB`, `RB`, `WR`, `TE`, `K`, and `DST`.
- The rookie draft room now relies on `yearsPro = 0` to treat a player as rookie-eligible.

Canonical file contents:
- 257 total prospects from the provided mock class
- Original source and pick metadata retained
- Normalized `nflTeam` abbreviation added
- `isFantasyPosition` flag added to distinguish rows the current importer can handle directly

Import file contents:
- 86 fantasy-eligible prospects
- Position mix: 37 `WR`, 17 `RB`, 17 `TE`, 13 `QB`, 2 `K`
- `prospect_id` mapped to both `sourcePlayerId` and `externalId`
- `projected_nfl_team` normalized to NFL abbreviations for `nflTeam`
- `yearsPro` set to `0`
- `statusCode` set to `ROOKIE`
- `statusText` set to `2026 rookie mock class`
- `isRestricted` set to `false`

What is not in the import file:
- 171 rows with unsupported positions for the current importer
- Omitted positions: 29 `EDGE`, 26 `LB`, 26 `CB`, 25 `OT`, 23 `DL`, 22 `IOL`, 20 `S`
- Source-only metadata such as `school`, `overall_pick`, `round`, `pick_in_round`, `source`, and `source_url`

Normalization notes:
- Converted curly apostrophes to ASCII in `Ja'Kobi Lane`, `J'Mari Taylor`, and `Le'Veon Moss`
- Kept the original `prospect_id` slug format for stable imports and duplicate detection
