CREATE UNIQUE INDEX IF NOT EXISTS "LeagueMembership_single_commissioner_per_league"
ON "LeagueMembership"("leagueId")
WHERE "role" = 'COMMISSIONER';
