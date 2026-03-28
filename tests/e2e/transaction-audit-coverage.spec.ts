import { expect, test } from "@playwright/test";
import {
  apiContext,
  COMMISSIONER_EMAIL,
  createSettlementReadyTradeProposalWithRetry,
  getTeams,
  settleTradeProposal,
} from "./helpers/api";

type TransactionRow = {
  id: string;
  type: string;
  metadata: unknown;
  audit: {
    schemaVersion: number;
    actor: {
      email: string | null;
      leagueRole: string | null;
      teamId: string | null;
    } | null;
    source: string | null;
    entities: Record<string, unknown> | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    details: unknown;
  } | null;
};

test.describe("Transaction Audit Coverage", () => {
  test("processed trades emit actor-attributed audit records and support audit filters", async ({
    baseURL,
  }) => {
    const commissioner = await apiContext(baseURL as string, COMMISSIONER_EMAIL);

    const teams = await getTeams(commissioner);
    expect(teams.length).toBeGreaterThan(1);

    const teamA = teams.length >= 6 ? teams[3] : teams.at(-1);
    const teamB = teams.length >= 6 ? teams[4] : teams.at(-2);
    expect(teamA).toBeTruthy();
    expect(teamB).toBeTruthy();
    if (!teamA || !teamB) {
      throw new Error("Expected at least two teams for transaction audit test.");
    }

    const proposal = await createSettlementReadyTradeProposalWithRetry(commissioner, {
      proposerTeamId: teamA.id,
      counterpartyTeamId: teamB.id,
    });
    expect(proposal.response.ok()).toBeTruthy();
    expect(["ACCEPTED", "REVIEW_APPROVED"]).toContain(proposal.payload.proposal.status);

    const proposalId = proposal.payload.proposal.id as string;

    const processed = await settleTradeProposal(commissioner, proposalId);
    expect(processed.response.ok()).toBeTruthy();
    expect(processed.payload.proposal.status).toBe("PROCESSED");

    const response = await commissioner.get(
      `/api/transactions?proposalId=${proposalId}&actorEmail=${encodeURIComponent(COMMISSIONER_EMAIL)}&limit=200`,
    );
    expect(response.ok()).toBeTruthy();
    const payload = (await response.json()) as {
      transactions: TransactionRow[];
      filters: {
        actorEmail: string | null;
        proposalId: string | null;
        tradeId: string | null;
      };
    };

    expect(payload.filters.actorEmail).toBe(COMMISSIONER_EMAIL);
    expect(payload.filters.proposalId).toBe(proposalId);
    expect(payload.transactions.length).toBeGreaterThan(0);

    for (const transaction of payload.transactions) {
      expect(transaction.audit?.schemaVersion).toBe(1);
      expect(transaction.audit?.actor?.email).toBe(COMMISSIONER_EMAIL);
      expect(transaction.audit?.actor?.leagueRole).toBe("COMMISSIONER");
      expect(transaction.audit?.entities?.tradeProposalId).toBe(proposalId);
    }

    const processSummary = payload.transactions.find(
      (transaction) => transaction.type === "COMMISSIONER_OVERRIDE",
    );
    expect(processSummary).toBeTruthy();
    expect(["ACCEPTED", "REVIEW_APPROVED"]).toContain(
      processSummary?.audit?.before?.status as string,
    );
    expect(processSummary?.audit?.after?.status).toBe("PROCESSED");

    const pickTransfer = payload.transactions.find((transaction) => transaction.type === "PICK_TRANSFER");
    expect(pickTransfer).toBeTruthy();
    expect(pickTransfer?.audit?.entities?.assetId).toBeTruthy();
    expect(pickTransfer?.audit?.before?.teamId).toBeTruthy();
    expect(pickTransfer?.audit?.after?.teamId).toBeTruthy();

    await commissioner.dispose();
  });
});
