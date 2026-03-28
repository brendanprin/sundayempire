import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createTradeProposal,
  createSettlementReadyTradeProposalWithRetry,
  getRoster,
  getTeams,
  settleTradeProposal,
} from "./helpers/api";

function pickAsset(futurePickId: string) {
  return { assetType: "PICK", futurePickId };
}

function playerAsset(playerId: string) {
  return { assetType: "PLAYER", playerId };
}

test.describe("Trade Workflows", () => {
  test("picks-only analyze and create are accepted", async ({ baseURL, request }) => {
    const ctx = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(ctx);
    expect(teams.length).toBeGreaterThan(1);

    const teamA = teams[0];
    const teamB = teams[1];

    const rosterA = await getRoster(ctx, teamA.id);
    const rosterB = await getRoster(ctx, teamB.id);

    const pickA = rosterA.picks.find((pick) => !pick.isUsed);
    const pickB = rosterB.picks.find((pick) => !pick.isUsed);
    const playerA = rosterA.contracts.find((contract) => contract.player?.id);
    const playerB = rosterB.contracts.find((contract) => contract.player?.id);

    expect(pickA).toBeTruthy();
    expect(pickB).toBeTruthy();
    expect(playerA?.player?.id).toBeTruthy();
    expect(playerB?.player?.id).toBeTruthy();
    if (!pickA || !pickB || !playerA?.player?.id || !playerB?.player?.id) {
      throw new Error("Expected available player and pick assets for trade workflow test.");
    }

    const analyzeResponse = await request.post(`${baseURL}/api/trades/analyze`, {
      headers: {
        "x-dynasty-user-email": COMMISSIONER_EMAIL,
        "content-type": "application/json",
      },
      data: {
        teamAId: teamA.id,
        teamBId: teamB.id,
        teamAAssets: [playerAsset(playerA.player.id), pickAsset(pickA.id)],
        teamBAssets: [playerAsset(playerB.player.id), pickAsset(pickB.id)],
      },
    });

    expect(analyzeResponse.ok()).toBeTruthy();
    const analysis = await analyzeResponse.json();
    const findingCodes = (analysis.findings ?? []).map((finding) => finding.code);
    expect(findingCodes).not.toContain("TEAM_A_PLAYER_REQUIRED");
    expect(findingCodes).not.toContain("TEAM_B_PLAYER_REQUIRED");

    const { response, payload } = await createTradeProposal(ctx, {
      proposerTeamId: teamA.id,
      counterpartyTeamId: teamB.id,
      proposerAssets: [playerAsset(playerA.player.id), pickAsset(pickA.id)],
      counterpartyAssets: [playerAsset(playerB.player.id), pickAsset(pickB.id)],
    });

    expect(response.ok()).toBeTruthy();
    expect(payload.proposal.status).toBe("DRAFT");

    await ctx.dispose();
  });

  test("processing trade updates pick ownership", async ({ baseURL }) => {
    const ctx = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(ctx);
    const teamA = teams[0];
    const teamB = teams[1];

    const prepared = await createSettlementReadyTradeProposalWithRetry(ctx, {
      proposerTeamId: teamA.id,
      counterpartyTeamId: teamB.id,
    });
    expect(prepared.response.ok()).toBeTruthy();
    const proposalId = prepared.payload.proposal.id;
    const proposalAssets = prepared.payload.proposal.assets.filter(
      (asset: { assetType: string }) => asset.assetType === "PICK",
    );
    const outgoingAIds = proposalAssets
      .filter(
        (asset: {
          fromTeamId: string;
          futurePick: { id: string | null } | null;
        }) => asset.fromTeamId === teamA.id && typeof asset.futurePick?.id === "string",
      )
      .map((asset: { futurePick: { id: string } }) => asset.futurePick.id);
    const outgoingBIds = proposalAssets
      .filter(
        (asset: {
          fromTeamId: string;
          futurePick: { id: string | null } | null;
        }) => asset.fromTeamId === teamB.id && typeof asset.futurePick?.id === "string",
      )
      .map((asset: { futurePick: { id: string } }) => asset.futurePick.id);

    expect(outgoingAIds.length).toBeGreaterThan(0);
    expect(outgoingBIds.length).toBeGreaterThan(0);

    const processed = await settleTradeProposal(ctx, proposalId);
    expect(processed.response.ok()).toBeTruthy();
    expect(processed.payload.proposal.status).toBe("PROCESSED");

    const rosterANext = await getRoster(ctx, teamA.id);
    const rosterBNext = await getRoster(ctx, teamB.id);

    const teamAPickIds = new Set(rosterANext.picks.map((pick) => pick.id));
    const teamBPickIds = new Set(rosterBNext.picks.map((pick) => pick.id));

    for (const outgoingAId of outgoingAIds) {
      expect(teamAPickIds.has(outgoingAId)).toBeFalsy();
      expect(teamBPickIds.has(outgoingAId)).toBeTruthy();
    }
    for (const outgoingBId of outgoingBIds) {
      expect(teamAPickIds.has(outgoingBId)).toBeTruthy();
      expect(teamBPickIds.has(outgoingBId)).toBeFalsy();
    }

    await ctx.dispose();
  });
});
