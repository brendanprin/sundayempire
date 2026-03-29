import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  OWNER_EMAIL,
  getCapturedLeagueInvite,
  getPrimaryLeagueId,
} from "./helpers/api";

const NO_LEAGUE_USER_EMAIL = "noleague@local.league";
const PLATFORM_ADMIN_EMAIL = "platform-admin@local.league";

test.describe("Role Model Foundation", () => {
  test("authenticated USER can create a league and becomes commissioner by default", async ({
    baseURL,
  }) => {
    const userContext = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL);
    const leagueName = `Role Foundation ${Date.now()}`;

    const createResponse = await userContext.post("/api/leagues", {
      data: {
        name: leagueName,
        description: "Role model foundation coverage",
        seasonYear: 2026,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createdPayload = await createResponse.json();
    expect(createdPayload.membership.leagueRole).toBe("COMMISSIONER");

    const leaguesResponse = await userContext.get("/api/leagues");
    expect(leaguesResponse.ok()).toBeTruthy();
    const leaguesPayload = await leaguesResponse.json();
    const createdLeague = leaguesPayload.leagues.find(
      (league: { id: string }) => league.id === createdPayload.league.id,
    );

    expect(createdLeague).toBeTruthy();
    expect(createdLeague.leagueRole).toBe("COMMISSIONER");

    await userContext.dispose();
  });

  test("platform admin is not implicitly commissioner in unrelated leagues", async ({
    baseURL,
  }) => {
    const commissionerContext = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const seededLeagueId = await getPrimaryLeagueId(commissionerContext);
    await commissionerContext.dispose();

    const adminContext = await apiContext(
      baseURL as string,
      PLATFORM_ADMIN_EMAIL,
      seededLeagueId,
    );

    const response = await adminContext.post("/api/commissioner/season/phase", {
      data: {
        phase: "REGULAR_SEASON",
        reason: "Verifying platform admin is not league commissioner by default.",
      },
    });

    expect(response.status()).toBe(403);
    const payload = await response.json();
    expect(payload.code ?? payload.error?.code).toBe("FORBIDDEN");

    await adminContext.dispose();
  });

  test("alternate commissioner designation starts as acting commissioner and transfers on invite acceptance", async ({
    baseURL,
  }) => {
    const creatorContext = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL);
    const leagueName = `Alt Commissioner ${Date.now()}`;

    const createResponse = await creatorContext.post("/api/leagues", {
      data: {
        name: leagueName,
        description: "Alternate commissioner designation coverage",
        seasonYear: 2026,
        designatedCommissionerEmail: OWNER_EMAIL,
      },
    });
    expect(createResponse.ok()).toBeTruthy();
    const createPayload = await createResponse.json();
    const leagueId = createPayload.league.id as string;
    expect(createPayload.membership.leagueRole).toBe("COMMISSIONER");
    expect(createPayload.pendingCommissionerDesignation?.email).toBe(OWNER_EMAIL);

    const creatorScoped = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL, leagueId);
    const governanceBefore = await creatorScoped.get("/api/league/commissioner");
    expect(governanceBefore.ok()).toBeTruthy();
    const governanceBeforePayload = await governanceBefore.json();
    expect(governanceBeforePayload.commissioner.email).toBe(NO_LEAGUE_USER_EMAIL);
    expect(
      governanceBeforePayload.members.filter(
        (member: { leagueRole: string }) => member.leagueRole === "COMMISSIONER",
      ).length,
    ).toBe(1);
    expect(governanceBeforePayload.pendingCommissionerDesignation?.email).toBe(OWNER_EMAIL);

    const capturedInvite = await getCapturedLeagueInvite(baseURL as string, OWNER_EMAIL, {
      leagueId,
    });
    const inviteToken = new URL(capturedInvite.url).searchParams.get("token");
    expect(inviteToken).toBeTruthy();

    const designatedContext = await apiContext(baseURL as string, OWNER_EMAIL);
    const acceptResponse = await designatedContext.post("/api/league/invites/accept", {
      data: {
        token: inviteToken,
        returnTo: "/",
      },
    });
    expect(acceptResponse.ok()).toBeTruthy();
    const acceptPayload = await acceptResponse.json();
    expect(acceptPayload.membership.leagueRole).toBe("COMMISSIONER");
    expect(acceptPayload.membership.leagueId).toBe(leagueId);

    const governanceAfter = await creatorScoped.get("/api/league/commissioner");
    expect(governanceAfter.ok()).toBeTruthy();
    const governanceAfterPayload = await governanceAfter.json();
    expect(governanceAfterPayload.commissioner.email).toBe(OWNER_EMAIL);
    expect(
      governanceAfterPayload.members.filter(
        (member: { leagueRole: string }) => member.leagueRole === "COMMISSIONER",
      ).length,
    ).toBe(1);
    expect(governanceAfterPayload.pendingCommissionerDesignation).toBeNull();

    await creatorScoped.dispose();
    await creatorContext.dispose();
    await designatedContext.dispose();
  });

  test("founder can create a team and remain commissioner with team scope", async ({
    baseURL,
  }) => {
    const founderContext = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL);
    const createLeagueResponse = await founderContext.post("/api/leagues", {
      data: {
        name: `Founder Team Create ${Date.now()}`,
        description: "Founder team setup create path coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;

    const scopedFounder = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL, leagueId);
    const founderCreateResponse = await scopedFounder.post("/api/league/founder-team", {
      data: {
        action: "create",
        teamName: `Founder Franchise ${Date.now()}`,
        teamAbbreviation: `FF${Math.floor(Math.random() * 90 + 10)}`,
        divisionLabel: "Founders",
      },
    });
    expect(founderCreateResponse.ok()).toBeTruthy();
    const founderCreatePayload = await founderCreateResponse.json();
    expect(founderCreatePayload.founderSetup.isComplete).toBeTruthy();
    expect(founderCreatePayload.founderSetup.status).toBe("COMPLETE");
    expect(founderCreatePayload.founderSetup.currentTeam?.id).toBeTruthy();

    const authMeResponse = await scopedFounder.get("/api/auth/me");
    expect(authMeResponse.ok()).toBeTruthy();
    const authMePayload = await authMeResponse.json();
    expect(authMePayload.actor?.leagueRole).toBe("COMMISSIONER");
    expect(authMePayload.actor?.teamId).toBe(founderCreatePayload.founderSetup.currentTeam.id);

    const governanceResponse = await scopedFounder.get("/api/league/commissioner");
    expect(governanceResponse.ok()).toBeTruthy();

    await scopedFounder.dispose();
    await founderContext.dispose();
  });

  test("founder can claim an existing team and keep commissioner authority", async ({
    baseURL,
  }) => {
    const founderContext = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const createLeagueResponse = await founderContext.post("/api/leagues", {
      data: {
        name: `Founder Team Claim ${Date.now()}`,
        description: "Founder team setup claim path coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;

    const scopedFounder = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const seedTeamResponse = await scopedFounder.post("/api/teams", {
      data: {
        name: `Claimable Team ${Date.now()}`,
        abbreviation: `CL${Math.floor(Math.random() * 90 + 10)}`,
      },
    });
    expect(seedTeamResponse.ok()).toBeTruthy();
    const seedTeamPayload = await seedTeamResponse.json();
    const claimableTeamId = seedTeamPayload.team.id as string;

    const founderClaimResponse = await scopedFounder.post("/api/league/founder-team", {
      data: {
        action: "claim",
        teamId: claimableTeamId,
      },
    });
    expect(founderClaimResponse.ok()).toBeTruthy();
    const founderClaimPayload = await founderClaimResponse.json();
    expect(founderClaimPayload.founderSetup.isComplete).toBeTruthy();
    expect(founderClaimPayload.founderSetup.currentTeam?.id).toBe(claimableTeamId);

    const authMeResponse = await scopedFounder.get("/api/auth/me");
    expect(authMeResponse.ok()).toBeTruthy();
    const authMePayload = await authMeResponse.json();
    expect(authMePayload.actor?.leagueRole).toBe("COMMISSIONER");
    expect(authMePayload.actor?.teamId).toBe(claimableTeamId);

    const governanceResponse = await scopedFounder.get("/api/league/commissioner");
    expect(governanceResponse.ok()).toBeTruthy();

    await scopedFounder.dispose();
    await founderContext.dispose();
  });

  test("founder can skip team setup and incomplete state remains visible", async ({
    baseURL,
  }) => {
    const founderContext = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL);
    const createLeagueResponse = await founderContext.post("/api/leagues", {
      data: {
        name: `Founder Team Skip ${Date.now()}`,
        description: "Founder team setup skip path coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;

    const scopedFounder = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL, leagueId);
    const initialSetupResponse = await scopedFounder.get("/api/league/founder-team");
    expect(initialSetupResponse.ok()).toBeTruthy();
    const initialSetupPayload = await initialSetupResponse.json();
    expect(initialSetupPayload.founderSetup.isComplete).toBeFalsy();
    expect(initialSetupPayload.founderSetup.status).toBe("INCOMPLETE_REQUIRED");

    const skipResponse = await scopedFounder.post("/api/league/founder-team", {
      data: {
        action: "skip",
      },
    });
    expect(skipResponse.ok()).toBeTruthy();
    const skipPayload = await skipResponse.json();
    expect(skipPayload.founderSetup.isComplete).toBeFalsy();
    expect(skipPayload.founderSetup.hasPostponed).toBeTruthy();
    expect(skipPayload.founderSetup.status).toBe("INCOMPLETE_POSTPONED");

    const setupAfterSkipResponse = await scopedFounder.get("/api/league/founder-team");
    expect(setupAfterSkipResponse.ok()).toBeTruthy();
    const setupAfterSkipPayload = await setupAfterSkipResponse.json();
    expect(setupAfterSkipPayload.founderSetup.isComplete).toBeFalsy();
    expect(setupAfterSkipPayload.founderSetup.status).toBe("INCOMPLETE_POSTPONED");

    const authMeResponse = await scopedFounder.get("/api/auth/me");
    expect(authMeResponse.ok()).toBeTruthy();
    const authMePayload = await authMeResponse.json();
    expect(authMePayload.actor?.leagueRole).toBe("COMMISSIONER");
    expect(authMePayload.actor?.teamId).toBeNull();

    await scopedFounder.dispose();
    await founderContext.dispose();
  });

  test("founder postpone state survives duplicate create retry and later completes", async ({
    baseURL,
  }) => {
    const founderContext = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL);
    const createLeagueResponse = await founderContext.post("/api/leagues", {
      data: {
        name: `Founder Retry Recovery ${Date.now()}`,
        description: "Founder postpone and duplicate retry coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;

    const scopedFounder = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL, leagueId);

    const skipResponse = await scopedFounder.post("/api/league/founder-team", {
      data: {
        action: "skip",
      },
    });
    expect(skipResponse.ok()).toBeTruthy();
    const skipPayload = await skipResponse.json();
    expect(skipPayload.founderSetup.status).toBe("INCOMPLETE_POSTPONED");

    const duplicateTeamName = `Retry Duplicate ${Date.now()}`;
    const seedDuplicateTeamResponse = await scopedFounder.post("/api/teams", {
      data: {
        name: duplicateTeamName,
        abbreviation: `RD${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(seedDuplicateTeamResponse.ok()).toBeTruthy();

    const duplicateCreateResponse = await scopedFounder.post("/api/league/founder-team", {
      data: {
        action: "create",
        teamName: duplicateTeamName,
        teamAbbreviation: `FD${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(duplicateCreateResponse.status()).toBe(409);
    const duplicateCreatePayload = await duplicateCreateResponse.json();
    expect(duplicateCreatePayload.code ?? duplicateCreatePayload.error?.code).toBe("TEAM_ALREADY_EXISTS");

    const setupAfterDuplicateResponse = await scopedFounder.get("/api/league/founder-team");
    expect(setupAfterDuplicateResponse.ok()).toBeTruthy();
    const setupAfterDuplicatePayload = await setupAfterDuplicateResponse.json();
    expect(setupAfterDuplicatePayload.founderSetup.status).toBe("INCOMPLETE_POSTPONED");
    expect(setupAfterDuplicatePayload.founderSetup.isComplete).toBeFalsy();

    const authAfterDuplicateResponse = await scopedFounder.get("/api/auth/me");
    expect(authAfterDuplicateResponse.ok()).toBeTruthy();
    const authAfterDuplicatePayload = await authAfterDuplicateResponse.json();
    expect(authAfterDuplicatePayload.actor?.leagueRole).toBe("COMMISSIONER");
    expect(authAfterDuplicatePayload.actor?.teamId).toBeNull();

    const recoveredCreateResponse = await scopedFounder.post("/api/league/founder-team", {
      data: {
        action: "create",
        teamName: `Recovered Founder Team ${Date.now()}`,
        teamAbbreviation: `RF${Math.floor(Math.random() * 900 + 100)}`,
        divisionLabel: "Recovery",
      },
    });
    expect(recoveredCreateResponse.ok()).toBeTruthy();
    const recoveredCreatePayload = await recoveredCreateResponse.json();
    expect(recoveredCreatePayload.founderSetup.isComplete).toBeTruthy();
    expect(recoveredCreatePayload.founderSetup.status).toBe("COMPLETE");
    expect(recoveredCreatePayload.founderSetup.currentTeam?.id).toBeTruthy();

    const authAfterRecoveryResponse = await scopedFounder.get("/api/auth/me");
    expect(authAfterRecoveryResponse.ok()).toBeTruthy();
    const authAfterRecoveryPayload = await authAfterRecoveryResponse.json();
    expect(authAfterRecoveryPayload.actor?.leagueRole).toBe("COMMISSIONER");
    expect(authAfterRecoveryPayload.actor?.teamId).toBe(
      recoveredCreatePayload.founderSetup.currentTeam.id,
    );

    await scopedFounder.dispose();
    await founderContext.dispose();
  });

  test("setup invite guardrails reject duplicate pending invites and remain recoverable", async ({
    baseURL,
  }) => {
    const founderContext = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL);
    const createLeagueResponse = await founderContext.post("/api/leagues", {
      data: {
        name: `Invite Guardrails ${Date.now()}`,
        description: "Invite conflict resilience coverage",
        seasonYear: 2026,
      },
    });
    expect(createLeagueResponse.ok()).toBeTruthy();
    const createLeaguePayload = await createLeagueResponse.json();
    const leagueId = createLeaguePayload.league.id as string;

    const scopedFounder = await apiContext(baseURL as string, NO_LEAGUE_USER_EMAIL, leagueId);
    const inviteEmail = `invite-guardrail-${Date.now()}@example.test`;
    const createInviteResponse = await scopedFounder.post("/api/league/invites", {
      data: {
        ownerName: "Invite Guardrail Owner",
        ownerEmail: inviteEmail,
        teamName: `Invite Guardrail Team ${Date.now()}`,
        teamAbbreviation: `IG${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(createInviteResponse.ok()).toBeTruthy();

    const duplicateInviteResponse = await scopedFounder.post("/api/league/invites", {
      data: {
        ownerName: "Invite Guardrail Owner",
        ownerEmail: inviteEmail,
        teamName: `Duplicate Invite Team ${Date.now()}`,
        teamAbbreviation: `DG${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(duplicateInviteResponse.status()).toBe(409);
    const duplicateInvitePayload = await duplicateInviteResponse.json();
    expect(duplicateInvitePayload.code ?? duplicateInvitePayload.error?.code).toBe("INVITE_CONFLICT");

    const recoveryInviteResponse = await scopedFounder.post("/api/league/invites", {
      data: {
        ownerName: "Invite Guardrail Recovery Owner",
        ownerEmail: `invite-guardrail-recovery-${Date.now()}@example.test`,
        teamName: `Invite Guardrail Recovery Team ${Date.now()}`,
        teamAbbreviation: `RG${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(recoveryInviteResponse.ok()).toBeTruthy();

    await scopedFounder.dispose();
    await founderContext.dispose();
  });

  test("commissioner authority and team ownership can coexist for the same user", async ({
    baseURL,
  }) => {
    const commissionerContext = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const createdLeagueResponse = await commissionerContext.post("/api/leagues", {
      data: {
        name: `Commissioner Owner Coexistence ${Date.now()}`,
        description: "Commissioner and team owner overlap",
        seasonYear: 2026,
      },
    });
    expect(createdLeagueResponse.ok()).toBeTruthy();
    const createdLeaguePayload = await createdLeagueResponse.json();
    const leagueId = createdLeaguePayload.league.id as string;

    const scopedCommissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL, leagueId);
    const inviteOwnerResponse = await scopedCommissioner.post("/api/league/invites", {
      data: {
        ownerName: "Commissioner Owner Target",
        ownerEmail: OWNER_EMAIL,
        teamName: `Commissioner Owner Team ${Date.now()}`,
        teamAbbreviation: `CO${Math.floor(Math.random() * 900 + 100)}`,
      },
    });
    expect(inviteOwnerResponse.ok()).toBeTruthy();
    const inviteOwnerPayload = await inviteOwnerResponse.json();
    expect(inviteOwnerPayload.invite.intendedLeagueRole).toBe("MEMBER");
    expect(inviteOwnerPayload.invite.intendedRole).toBe("MEMBER");

    const ownerInvite = await getCapturedLeagueInvite(baseURL as string, OWNER_EMAIL, {
      leagueId,
    });
    const ownerInviteToken = new URL(ownerInvite.url).searchParams.get("token");
    expect(ownerInviteToken).toBeTruthy();

    const ownerContext = await apiContext(baseURL as string, OWNER_EMAIL);
    const acceptOwnerInviteResponse = await ownerContext.post("/api/league/invites/accept", {
      data: {
        token: ownerInviteToken,
        returnTo: "/",
      },
    });
    expect(acceptOwnerInviteResponse.ok()).toBeTruthy();
    const acceptOwnerInvitePayload = await acceptOwnerInviteResponse.json();
    expect(acceptOwnerInvitePayload.membership.leagueRole).toBe("MEMBER");

    const governanceResponse = await scopedCommissioner.get("/api/league/commissioner");
    expect(governanceResponse.ok()).toBeTruthy();
    const governancePayload = await governanceResponse.json();
    const ownerMembership = governancePayload.members.find(
      (member: { email: string }) => member.email === OWNER_EMAIL,
    );
    expect(ownerMembership).toBeTruthy();

    const transferResponse = await scopedCommissioner.post("/api/league/commissioner", {
      data: {
        targetUserId: ownerMembership.userId,
      },
    });
    expect(transferResponse.ok()).toBeTruthy();

    const ownerLeagueContext = await apiContext(baseURL as string, OWNER_EMAIL, leagueId);
    const ownerGovernanceResponse = await ownerLeagueContext.get("/api/league/commissioner");
    expect(ownerGovernanceResponse.ok()).toBeTruthy();
    const ownerGovernancePayload = await ownerGovernanceResponse.json();
    expect(ownerGovernancePayload.commissioner.email).toBe(OWNER_EMAIL);
    expect(ownerGovernancePayload.commissioner.teamName).toBeTruthy();
    expect(
      ownerGovernancePayload.members.filter(
        (member: { leagueRole: string }) => member.leagueRole === "COMMISSIONER",
      ).length,
    ).toBe(1);
    expect(
      ownerGovernancePayload.members.every(
        (member: { leagueRole: string }) =>
          member.leagueRole === "COMMISSIONER" || member.leagueRole === "MEMBER",
      ),
    ).toBeTruthy();

    await ownerLeagueContext.dispose();
    await ownerContext.dispose();
    await scopedCommissioner.dispose();
    await commissionerContext.dispose();
  });
});
