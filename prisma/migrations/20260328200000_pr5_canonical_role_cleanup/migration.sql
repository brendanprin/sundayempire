-- Defensive canonical backfill for legacy league-role values.
UPDATE "LeagueMembership"
SET "role" = 'MEMBER'
WHERE "role" IN ('OWNER', 'READ_ONLY');

UPDATE "LeagueInvite"
SET "intendedRole" = 'MEMBER'
WHERE "intendedRole" IN ('OWNER', 'READ_ONLY');

-- Canonicalize transaction audit actor payloads to leagueRole and drop legacy actor.role.
UPDATE "Transaction"
SET "metadata" = json_set(
  "metadata",
  '$.actor.leagueRole',
  CASE json_extract("metadata", '$.actor.leagueRole')
    WHEN 'COMMISSIONER' THEN 'COMMISSIONER'
    ELSE 'MEMBER'
  END
)
WHERE json_valid("metadata")
  AND json_type("metadata", '$.actor') = 'object'
  AND json_type("metadata", '$.actor.leagueRole') = 'text';

UPDATE "Transaction"
SET "metadata" = json_remove(
  json_set(
    "metadata",
    '$.actor.leagueRole',
    CASE json_extract("metadata", '$.actor.role')
      WHEN 'COMMISSIONER' THEN 'COMMISSIONER'
      ELSE 'MEMBER'
    END
  ),
  '$.actor.role'
)
WHERE json_valid("metadata")
  AND json_type("metadata", '$.actor') = 'object'
  AND json_type("metadata", '$.actor.role') = 'text'
  AND json_type("metadata", '$.actor.leagueRole') IS NULL;

UPDATE "Transaction"
SET "metadata" = json_remove("metadata", '$.actor.role')
WHERE json_valid("metadata")
  AND json_type("metadata", '$.actor.role') = 'text';
