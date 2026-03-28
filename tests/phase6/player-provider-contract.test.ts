import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProviderPlayers } from "../../prisma/player-data-provider";
import { createFantasyProsSeedProvider } from "../../prisma/providers/fantasypros-seed-provider";

test("FantasyPros seed provider returns normalized records through the provider contract", async () => {
  const provider = createFantasyProsSeedProvider();
  const players = await provider.loadPlayers();

  assert.equal(provider.id, "fantasypros-draft-rankings");
  assert.ok(players.length > 0);
  assert.ok(players.every((player) => player.sourceKey === provider.id));
  assert.ok(players.every((player) => player.sourcePlayerId.trim().length > 0));
  assert.ok(players.every((player) => (player.externalId ?? "").trim().length > 0));
  assert.ok(players.every((player) => player.name.trim().length > 0));
  assert.ok(
    players.every((player) =>
      (player.externalId ?? "").startsWith("fantasypros-draft-rankings-v1-"),
    ),
  );
});

test("normalizeProviderPlayers enforces trimming and NFL team normalization", () => {
  const normalized = normalizeProviderPlayers([
    {
      sourceKey: " fantasypros-draft-rankings ",
      sourcePlayerId: " sample-player ",
      externalId: " sample-player ",
      name: " Example Player ",
      displayName: " Example Player ",
      position: "WR",
      nflTeam: " buf ",
      age: 24.9,
      yearsPro: 3.4,
    },
    {
      sourceKey: "manual",
      sourcePlayerId: "sample-dst",
      externalId: "sample-dst",
      name: "Sample DST",
      position: "DST",
      nflTeam: "   ",
      age: 0,
      yearsPro: 0,
    },
    {
      sourceKey: "manual",
      sourcePlayerId: "sample-null-meta",
      externalId: "sample-null-meta",
      name: "Sample Null Meta",
      position: "RB",
      nflTeam: "FA",
      age: null,
      yearsPro: null,
    },
  ]);

  assert.equal(normalized[0].sourceKey, "fantasypros-draft-rankings");
  assert.equal(normalized[0].sourcePlayerId, "sample-player");
  assert.equal(normalized[0].externalId, "sample-player");
  assert.equal(normalized[0].name, "Example Player");
  assert.equal(normalized[0].displayName, "Example Player");
  assert.equal(normalized[0].nflTeam, "BUF");
  assert.equal(normalized[0].age, 24);
  assert.equal(normalized[0].yearsPro, 3);
  assert.equal(normalized[1].nflTeam, null);
  assert.equal(normalized[2].age, null);
  assert.equal(normalized[2].yearsPro, null);
});
