import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAuthenticatedLeagueEntry,
  resolvePostAuthenticationDestination,
} from "@/lib/auth-entry";

test("resolveAuthenticatedLeagueEntry distinguishes zero, one, and many leagues", () => {
  assert.deepEqual(resolveAuthenticatedLeagueEntry([]), {
    kind: "none",
    leagueIds: [],
    singleLeagueId: null,
  });

  assert.deepEqual(resolveAuthenticatedLeagueEntry(["league-1"]), {
    kind: "single",
    leagueIds: ["league-1"],
    singleLeagueId: "league-1",
  });

  assert.deepEqual(resolveAuthenticatedLeagueEntry(["league-1", "league-2", "league-1"]), {
    kind: "multiple",
    leagueIds: ["league-1", "league-2"],
    singleLeagueId: null,
  });
});

test("single-league users route directly into their workspace after sign-in", () => {
  assert.deepEqual(
    resolvePostAuthenticationDestination({
      returnTo: "/",
      readyLeagueIds: ["league-1"],
      explicitLeagueId: null,
    }),
    {
      redirectTo: "/league/league-1",
      activeLeagueId: "league-1",
    },
  );
});

test("multi-league users without an explicit active league land on the dashboard", () => {
  assert.deepEqual(
    resolvePostAuthenticationDestination({
      returnTo: "/trades",
      readyLeagueIds: ["league-1", "league-2"],
      explicitLeagueId: null,
    }),
    {
      redirectTo: "/my-leagues",
      activeLeagueId: null,
    },
  );
});

test("valid explicit active league selection preserves non-league returnTo routes", () => {
  assert.deepEqual(
    resolvePostAuthenticationDestination({
      returnTo: "/trades",
      readyLeagueIds: ["league-1", "league-2"],
      explicitLeagueId: "league-2",
    }),
    {
      redirectTo: "/trades",
      activeLeagueId: "league-2",
    },
  );
});

test("invalid requested league ids fall back to the dashboard", () => {
  assert.deepEqual(
    resolvePostAuthenticationDestination({
      returnTo: "/league/not-a-real-league",
      readyLeagueIds: ["league-1", "league-2"],
      explicitLeagueId: "not-a-real-league",
    }),
    {
      redirectTo: "/my-leagues",
      activeLeagueId: null,
    },
  );
});
