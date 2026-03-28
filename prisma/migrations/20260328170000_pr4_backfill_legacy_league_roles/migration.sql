UPDATE "LeagueMembership"
SET "role" = 'MEMBER'
WHERE "role" IN ('OWNER', 'READ_ONLY');

UPDATE "LeagueInvite"
SET "intendedRole" = 'MEMBER'
WHERE "intendedRole" IN ('OWNER', 'READ_ONLY');
