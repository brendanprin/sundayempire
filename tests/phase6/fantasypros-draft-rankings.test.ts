import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFantasyProsDraftRankingLookup,
  FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID,
  FANTASYPROS_DRAFT_RANKINGS_PROVIDER_VERSION,
  fantasyProsDraftRankingLookupKey,
  fantasyProsSeedExternalIdPrefix,
  loadFantasyProsDraftRankings,
} from "@/lib/fantasypros-draft-rankings";
import { createFantasyProsSeedProvider } from "../../prisma/providers/fantasypros-seed-provider";

test("FantasyPros rankings parser loads the in-repo CSV with stable top-ranked records", () => {
  const rankings = loadFantasyProsDraftRankings();

  assert.equal(rankings.length, 338);
  assert.deepEqual(rankings[0], {
    overallRank: 1,
    tier: 1,
    name: "Ja'Marr Chase",
    nflTeam: "CIN",
    position: "WR",
    positionRank: 1,
    bestRank: 1,
    worstRank: 1,
    averageRank: 1,
    standardDeviation: 0,
    ecrVsAdp: null,
  });
});

test("FantasyPros ranking lookup resolves seeded player identity", () => {
  const rankings = loadFantasyProsDraftRankings();
  const lookup = buildFantasyProsDraftRankingLookup(rankings);
  const topPlayer = rankings[0];

  const resolved = lookup.get(
    fantasyProsDraftRankingLookupKey({
      name: topPlayer.name,
      nflTeam: topPlayer.nflTeam,
      position: topPlayer.position,
    }),
  );

  assert.equal(resolved?.overallRank, 1);
  assert.equal(resolved?.tier, 1);
});

test("FantasyPros seed provider returns normalized draft players with deterministic ids", async () => {
  const provider = createFantasyProsSeedProvider();
  const players = await provider.loadPlayers();

  assert.equal(provider.id, FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID);
  assert.equal(provider.version, FANTASYPROS_DRAFT_RANKINGS_PROVIDER_VERSION);
  assert.equal(players.length, 338);
  assert.ok(
    players.every((player) =>
      (player.externalId ?? "").startsWith(fantasyProsSeedExternalIdPrefix(provider.version)),
    ),
  );
  assert.ok(players.every((player) => player.sourceKey === provider.id));
  assert.ok(
    players.every((player) =>
      player.sourcePlayerId.startsWith(fantasyProsSeedExternalIdPrefix(provider.version)),
    ),
  );
  assert.equal(players[0].name, "Ja'Marr Chase");
  assert.equal(players[0].displayName, "Ja'Marr Chase");
  assert.equal(players[0].age, null);
  assert.equal(players[0].yearsPro, null);
});
