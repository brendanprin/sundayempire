import assert from "node:assert/strict";
import test from "node:test";
import { createCommissionerAuditReadLayer } from "@/lib/read-models/audit/commissioner-audit-read-layer";

test("commissioner audit read layer merges durable records into normalized entries", async () => {
  const readLayer = createCommissionerAuditReadLayer({
    league: {
      async findUnique() {
        return {
          id: "league-1",
          name: "Dynasty League",
          description: null,
          seasons: [
            {
              id: "season-1",
              year: 2026,
              status: "ACTIVE",
              phase: "REGULAR_SEASON",
              openedAt: null,
              closedAt: null,
            },
          ],
        };
      },
    },
    season: {
      async findMany() {
        return [
          {
            id: "season-1",
            year: 2026,
            status: "ACTIVE",
            phase: "REGULAR_SEASON",
          },
        ];
      },
    },
    team: {
      async findMany() {
        return [
          {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
          {
            id: "team-2",
            name: "Bench Mob",
            abbreviation: "BEN",
          },
        ];
      },
    },
    leaguePhaseTransition: {
      async findMany() {
        return [
          {
            id: "transition-1",
            seasonId: "season-1",
            fromPhase: "PRESEASON_SETUP",
            toPhase: "REGULAR_SEASON",
            transitionStatus: "APPLIED",
            occurredAt: new Date("2026-03-20T15:00:00.000Z"),
            initiatedByUser: {
              id: "user-1",
              email: "commissioner@example.com",
              name: "Commissioner",
            },
          },
        ];
      },
    },
    commissionerOverride: {
      async findMany() {
        return [];
      },
    },
    complianceAction: {
      async findMany() {
        return [];
      },
    },
    transaction: {
      async findMany() {
        return [];
      },
    },
    tradeProposal: {
      async findMany() {
        return [
          {
            id: "proposal-1",
            status: "REVIEW_APPROVED",
            proposerTeamId: "team-1",
            counterpartyTeamId: "team-2",
            submittedAt: new Date("2026-03-19T15:00:00.000Z"),
            counterpartyRespondedAt: null,
            reviewedAt: new Date("2026-03-22T15:00:00.000Z"),
            updatedAt: new Date("2026-03-22T15:00:00.000Z"),
            proposerTeam: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
            counterpartyTeam: {
              id: "team-2",
              name: "Bench Mob",
              abbreviation: "BEN",
            },
            createdByUser: null,
            submittedByUser: null,
            respondedByUser: null,
            reviewedByUser: {
              id: "user-1",
              email: "commissioner@example.com",
              name: "Commissioner",
            },
            evaluations: [
              {
                id: "evaluation-1",
                outcome: "FAIL_REQUIRES_COMMISSIONER",
                trigger: "COMMISSIONER_REVIEW",
                evaluatedAt: new Date("2026-03-22T14:00:00.000Z"),
              },
            ],
          },
        ];
      },
    },
    draftSelection: {
      async findMany() {
        return [];
      },
    },
    auctionAward: {
      async findMany() {
        return [];
      },
    },
    syncMismatch: {
      async findMany() {
        return [
          {
            id: "mismatch-1",
            mismatchType: "ROSTER_TEAM_DIFFERENCE",
            severity: "HIGH_IMPACT",
            status: "ESCALATED",
            title: "Roster assignment drift",
            message: "Host team differs from Dynasty team.",
            lastDetectedAt: new Date("2026-03-21T15:00:00.000Z"),
            team: {
              id: "team-1",
              name: "Cap Casualties",
              abbreviation: "CAP",
            },
            player: {
              id: "player-1",
              name: "Player One",
            },
            complianceIssue: {
              id: "issue-1",
              title: "Sync drift",
            },
            resolvedByUser: {
              id: "user-1",
              email: "commissioner@example.com",
              name: "Commissioner",
            },
          },
        ];
      },
    },
  } as never);

  const result = await readLayer.list({
    leagueId: "league-1",
    seasonId: "season-1",
    limit: 10,
  });

  assert.ok(result);
  assert.equal(result.summary.total, 3);
  assert.equal(result.entries[0]?.sourceKind, "trade_proposal");
  assert.equal(result.entries[1]?.sourceKind, "sync_mismatch");
  assert.equal(result.summary.bySourceKind.trade_proposal, 1);
  assert.equal(result.summary.byType["trade.proposal.review_approved"], 1);
});

test("commissioner audit read layer returns detailed sync mismatch sections", async () => {
  const readLayer = createCommissionerAuditReadLayer({
    syncMismatch: {
      async findFirst() {
        return {
          id: "mismatch-1",
          leagueId: "league-1",
          seasonId: "season-1",
          mismatchType: "ROSTER_TEAM_DIFFERENCE",
          severity: "HIGH_IMPACT",
          status: "ESCALATED",
          resolutionType: "ESCALATE_TO_COMPLIANCE",
          resolutionReason: "Cap impact requires review.",
          title: "Roster assignment drift",
          message: "Host team differs from Dynasty team.",
          hostValueJson: {
            teamName: "Bench Mob",
          },
          dynastyValueJson: {
            teamName: "Cap Casualties",
          },
          metadataJson: {
            adapterKey: "csv-manual",
          },
          lastDetectedAt: new Date("2026-03-21T15:00:00.000Z"),
          team: {
            id: "team-1",
            name: "Cap Casualties",
            abbreviation: "CAP",
          },
          player: {
            id: "player-1",
            name: "Player One",
          },
          complianceIssue: {
            id: "issue-1",
            title: "Sync drift",
          },
          resolvedByUser: {
            id: "user-1",
            email: "commissioner@example.com",
            name: "Commissioner",
          },
          job: {
            id: "job-1",
            jobType: "FULL_SYNC",
            trigger: "CSV_UPLOAD",
            adapterKey: "csv-manual",
          },
        };
      },
    },
  } as never);

  const detail = await readLayer.readDetail({
    leagueId: "league-1",
    seasonId: "season-1",
    entryId: "sync_mismatch:mismatch-1",
  });

  assert.ok(detail);
  assert.equal(detail.sourceKind, "sync_mismatch");
  assert.equal(detail.sections[0]?.label, "Mismatch");
  assert.equal(detail.entity?.entityId, "mismatch-1");
  assert.equal(detail.sourceRecord.resolutionType, "ESCALATE_TO_COMPLIANCE");
});
