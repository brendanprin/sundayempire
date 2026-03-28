import assert from "node:assert/strict";
import test from "node:test";
import { createActorContextService } from "@/lib/application/actor-context/service";
import { requireActorTeamScope } from "@/lib/auth";

function createStubClient(input: {
  userRecord: {
    id: string;
    email: string;
    name: string | null;
    memberships: {
      leagueId: string;
      role: "COMMISSIONER" | "MEMBER";
      teamId: string | null;
      team: {
        id: string;
        name: string;
      } | null;
    }[];
  } | null;
  teamMemberships: {
    teamId: string;
    membershipType: "PRIMARY_MANAGER" | "CO_MANAGER";
    createdAt: Date;
    team: {
      id: string;
      name: string;
      leagueId: string;
    };
  }[];
}) {
  return {
    user: {
      async findUnique() {
        return input.userRecord;
      },
    },
    teamMembership: {
      async findMany() {
        return input.teamMemberships;
      },
    },
  };
}

test("actor context prefers TeamMembership over LeagueMembership teamId", async () => {
  const service = createActorContextService(
    createStubClient({
      userRecord: {
        id: "user-1",
        email: "owner@example.com",
        name: "Owner One",
        memberships: [
          {
            leagueId: "league-1",
            role: "MEMBER",
            teamId: "legacy-team",
            team: {
              id: "legacy-team",
              name: "Legacy Team",
            },
          },
        ],
      },
      teamMemberships: [
        {
          teamId: "new-team",
          membershipType: "PRIMARY_MANAGER",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          team: {
            id: "new-team",
            name: "New Team",
            leagueId: "league-1",
          },
        },
      ],
    }) as never,
  );

  const actor = await service.resolveActorForUserId("user-1", "league-1");
  assert.ok(actor);
  assert.equal(actor?.teamId, "new-team");
  assert.equal(actor?.teamName, "New Team");
  assert.equal(actor?.leagueRole, "MEMBER");
  assert.equal(actor?.teamMembershipType, "PRIMARY_MANAGER");
  assert.equal(actor?.resolutionSource, "TEAM_MEMBERSHIP");
});

test("actor context prioritizes PRIMARY_MANAGER over CO_MANAGER memberships", async () => {
  const service = createActorContextService(
    createStubClient({
      userRecord: {
        id: "user-priority",
        email: "priority@example.com",
        name: "Priority User",
        memberships: [
          {
            leagueId: "league-1",
            role: "MEMBER",
            teamId: null,
            team: null,
          },
        ],
      },
      teamMemberships: [
        {
          teamId: "co-team",
          membershipType: "CO_MANAGER",
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          team: {
            id: "co-team",
            name: "Co Team",
            leagueId: "league-1",
          },
        },
        {
          teamId: "primary-team",
          membershipType: "PRIMARY_MANAGER",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          team: {
            id: "primary-team",
            name: "Primary Team",
            leagueId: "league-1",
          },
        },
      ],
    }) as never,
  );

  const actor = await service.resolveActorForUserId("user-priority", "league-1");
  assert.ok(actor);
  assert.equal(actor?.teamId, "primary-team");
  assert.equal(actor?.teamName, "Primary Team");
  assert.equal(actor?.teamMembershipType, "PRIMARY_MANAGER");
  assert.equal(actor?.resolutionSource, "TEAM_MEMBERSHIP");
});

test("actor context falls back to LeagueMembership teamId when TeamMembership is absent", async () => {
  const service = createActorContextService(
    createStubClient({
      userRecord: {
        id: "user-2",
        email: "legacy@example.com",
        name: "Legacy Owner",
        memberships: [
          {
            leagueId: "league-1",
            role: "MEMBER",
            teamId: "legacy-team",
            team: {
              id: "legacy-team",
              name: "Legacy Team",
            },
          },
        ],
      },
      teamMemberships: [],
    }) as never,
  );

  const actor = await service.resolveActorForUserId("user-2", "league-1");
  assert.ok(actor);
  assert.equal(actor?.teamId, "legacy-team");
  assert.equal(actor?.teamName, "Legacy Team");
  assert.equal(actor?.leagueRole, "MEMBER");
  assert.equal(actor?.teamMembershipType, null);
  assert.equal(actor?.resolutionSource, "LEAGUE_MEMBERSHIP");
});

test("actor context preserves commissioner league-wide access with no team", async () => {
  const service = createActorContextService(
    createStubClient({
      userRecord: {
        id: "user-3",
        email: "commissioner@example.com",
        name: "Commissioner",
        memberships: [
          {
            leagueId: "league-1",
            role: "COMMISSIONER",
            teamId: null,
            team: null,
          },
        ],
      },
      teamMemberships: [],
    }) as never,
  );

  const actor = await service.resolveActorForUserId("user-3", "league-1");
  assert.ok(actor);
  assert.equal(actor?.leagueRole, "COMMISSIONER");
  assert.equal(actor?.teamId, null);
  assert.equal(actor?.resolutionSource, "COMMISSIONER_NO_TEAM");
});

test("commissioner can also hold active team scope in the same league", async () => {
  const service = createActorContextService(
    createStubClient({
      userRecord: {
        id: "user-4",
        email: "commissioner-owner@example.com",
        name: "Commissioner Owner",
        memberships: [
          {
            leagueId: "league-1",
            role: "COMMISSIONER",
            teamId: null,
            team: null,
          },
        ],
      },
      teamMemberships: [
        {
          teamId: "team-1",
          membershipType: "PRIMARY_MANAGER",
          createdAt: new Date("2025-01-01T00:00:00.000Z"),
          team: {
            id: "team-1",
            name: "Commissioner Team",
            leagueId: "league-1",
          },
        },
      ],
    }) as never,
  );

  const actor = await service.resolveActorForUserId("user-4", "league-1");
  assert.ok(actor);
  assert.equal(actor?.leagueRole, "COMMISSIONER");
  assert.equal(actor?.teamId, "team-1");
  assert.equal(actor?.resolutionSource, "TEAM_MEMBERSHIP");

  assert.equal(requireActorTeamScope(actor!, "team-1"), null);
  assert.equal(requireActorTeamScope(actor!, "team-2"), null);
});

test("team-scope authorization restricts members to their assigned team", () => {
  const memberActor = {
    userId: "user-5",
    email: "member@example.com",
    name: "Member",
    accountRole: "USER" as const,
    leagueId: "league-1",
    leagueRole: "MEMBER" as const,
    teamId: "team-1",
    teamName: "Assigned Team",
  };

  assert.equal(requireActorTeamScope(memberActor, "team-1"), null);
  assert.ok(requireActorTeamScope(memberActor, "team-2"));
});
