import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createSettlementReadyTradeProposalWithRetry,
  getTeams,
  settleTradeProposal,
} from "./helpers/api";

type AnalyticsPayload = {
  funnels: {
    trade: {
      proposed: number;
      accepted: number;
      processed: number;
    };
    roster: {
      swap: number;
    };
  };
  events: {
    id: string;
    eventType: string;
    entityId: string | null;
  }[];
};

async function expectEventRecorded(
  ctx: Awaited<ReturnType<typeof apiContext>>,
  eventType: string,
  entityId: string,
) {
  const response = await ctx.get(
    `/api/commissioner/analytics/events?sinceHours=2&limit=100&eventType=${encodeURIComponent(
      eventType,
    )}&entityId=${encodeURIComponent(entityId)}`,
  );
  expect(response.ok()).toBeTruthy();
  const payload = (await response.json()) as AnalyticsPayload;
  expect(payload.events.length).toBeGreaterThan(0);
  expect(payload.events.some((event) => event.eventType === eventType)).toBeTruthy();
}

test.describe("Pilot Usage Instrumentation", () => {
  test("trade lifecycle and roster workflows emit analytics events with funnel metrics", async ({
    baseURL,
  }) => {
    const ctx = await apiContext(baseURL as string, COMMISSIONER_EMAIL);
    const teams = await getTeams(ctx);
    expect(teams.length).toBeGreaterThan(1);

    const teamA = teams.at(-1);
    const teamB = teams.at(-2);
    expect(teamA).toBeTruthy();
    expect(teamB).toBeTruthy();
    if (!teamA || !teamB) {
      throw new Error("Expected at least two teams for instrumentation fixture.");
    }
    const rosterTeam = teams.length > 2 ? teams[0] : teamA;

    const preseasonResponse = await ctx.post("/api/commissioner/season/phase", {
      data: {
        phase: "PRESEASON",
        reason: "e2e roster swap seed",
      },
    });
    expect(preseasonResponse.ok()).toBeTruthy();

    const rosterResponse = await ctx.get(`/api/teams/${rosterTeam.id}/roster`);
    expect(rosterResponse.ok()).toBeTruthy();
    const rosterPayload = (await rosterResponse.json()) as {
      rosterSlots: {
        id: string;
        slotType: "STARTER" | "BENCH" | "IR" | "TAXI";
        player: { id: string } | null;
      }[];
    };
    const benchSlots = rosterPayload.rosterSlots.filter(
      (slot) => slot.slotType === "BENCH" && slot.player,
    );
    expect(benchSlots.length).toBeGreaterThan(1);
    if (benchSlots.length < 2) {
      throw new Error("Expected at least two bench slots for a safe roster swap.");
    }

    const swapResponse = await ctx.patch(`/api/teams/${rosterTeam.id}/roster`, {
      data: {
        action: "swap",
        sourceRosterSlotId: benchSlots[0].id,
        targetRosterSlotId: benchSlots[1].id,
      },
    });
    expect(swapResponse.ok()).toBeTruthy();

    const regularSeasonResponse = await ctx.post("/api/commissioner/season/phase", {
      data: {
        phase: "REGULAR_SEASON",
        reason: "e2e trade workflow restore",
      },
    });
    expect(regularSeasonResponse.ok()).toBeTruthy();

    const proposal = await createSettlementReadyTradeProposalWithRetry(ctx, {
      proposerTeamId: teamA.id,
      counterpartyTeamId: teamB.id,
    });
    expect(proposal.response.ok()).toBeTruthy();
    const proposalId = proposal.payload.proposal.id as string;
    const processed = await settleTradeProposal(ctx, proposalId);
    expect(processed.response.ok()).toBeTruthy();

    await expectEventRecorded(ctx, "trade.proposal.created", proposalId);
    await expectEventRecorded(ctx, "trade.accepted", proposalId);
    await expectEventRecorded(ctx, "trade.processed", proposalId);
    await expectEventRecorded(ctx, "roster.swap.completed", rosterTeam.id);

    const analyticsResponse = await ctx.get("/api/commissioner/analytics/events?sinceHours=2&limit=200");
    expect(analyticsResponse.ok()).toBeTruthy();
    const analyticsPayload = (await analyticsResponse.json()) as AnalyticsPayload;
    expect(analyticsPayload.funnels.trade.proposed).toBeGreaterThan(0);
    expect(analyticsPayload.funnels.trade.accepted).toBeGreaterThan(0);
    expect(analyticsPayload.funnels.trade.processed).toBeGreaterThan(0);
    expect(analyticsPayload.funnels.roster.swap).toBeGreaterThan(0);

    await ctx.dispose();
  });
});
