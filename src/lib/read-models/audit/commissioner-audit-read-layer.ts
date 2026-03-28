import { prisma } from "@/lib/prisma";
import {
  parseTransactionAuditMetadata,
  type TransactionAuditMetadata,
} from "@/lib/transactions";
import {
  resolveLeagueSeasonContext,
  type DashboardProjectionDbClient,
} from "@/lib/read-models/dashboard/shared";
import type {
  CommissionerAuditEntryDetail,
  CommissionerAuditEntrySummary,
  CommissionerAuditProjection,
  CommissionerAuditSourceKind,
} from "@/lib/read-models/audit/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function encodeEntryId(sourceKind: CommissionerAuditSourceKind, sourceId: string) {
  return `${sourceKind}:${sourceId}`;
}

function decodeEntryId(entryId: string): {
  sourceKind: CommissionerAuditSourceKind;
  sourceId: string;
} | null {
  const [sourceKind, ...rest] = entryId.split(":");
  const sourceId = rest.join(":");

  if (!sourceId) {
    return null;
  }

  const validKinds: CommissionerAuditSourceKind[] = [
    "phase_transition",
    "commissioner_override",
    "compliance_action",
    "transaction",
    "trade_proposal",
    "draft_selection",
    "auction_award",
    "sync_mismatch",
  ];

  return validKinds.includes(sourceKind as CommissionerAuditSourceKind)
    ? {
        sourceKind: sourceKind as CommissionerAuditSourceKind,
        sourceId,
      }
    : null;
}

function buildActor(input: {
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  leagueRole?: string | null;
}) {
  const hasValue = Boolean(input.userId || input.email || input.name || input.leagueRole);
  if (!hasValue) {
    return null;
  }

  return {
    userId: input.userId ?? null,
    email: input.email ?? null,
    name: input.name ?? null,
    leagueRole: input.leagueRole ?? null,
  };
}

function matchesActorFilter(entry: CommissionerAuditEntrySummary, actorFilter: string | null) {
  if (!actorFilter) {
    return true;
  }

  const normalized = actorFilter.toLowerCase();
  return (
    entry.actor?.userId?.toLowerCase() === normalized ||
    entry.actor?.email?.toLowerCase() === normalized
  );
}

function matchesEntityFilter(
  entry: CommissionerAuditEntrySummary,
  entityType: string | null,
  entityId: string | null,
) {
  if (entityType && entry.entity?.entityType !== entityType) {
    return false;
  }

  if (entityId && entry.entity?.entityId !== entityId) {
    return false;
  }

  return true;
}

function sortEntriesDesc(left: CommissionerAuditEntrySummary, right: CommissionerAuditEntrySummary) {
  const timeDelta = new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime();
  if (timeDelta !== 0) {
    return timeDelta;
  }

  return right.id.localeCompare(left.id);
}

function buildSections(sections: Array<{ label: string; value: Record<string, unknown> | null }>) {
  return sections.filter((section) => section.value && Object.keys(section.value).length > 0);
}

export function createCommissionerAuditReadLayer(client: DashboardProjectionDbClient = prisma) {
  async function readBaseOptions(input: { leagueId: string; seasonId?: string | null }) {
    const context = await resolveLeagueSeasonContext(client, {
      leagueId: input.leagueId,
      seasonId: input.seasonId ?? undefined,
    });

    if (!context?.league) {
      return null;
    }

    const [seasons, teams] = await Promise.all([
      client.season.findMany({
        where: {
          leagueId: input.leagueId,
        },
        orderBy: [{ year: "desc" }],
        select: {
          id: true,
          year: true,
          status: true,
          phase: true,
        },
      }),
      client.team.findMany({
        where: {
          leagueId: input.leagueId,
        },
        orderBy: [{ name: "asc" }],
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      }),
    ]);

    return {
      context,
      seasons,
      teams,
    };
  }

  return {
    async list(input: {
      leagueId: string;
      seasonId?: string | null;
      teamId?: string | null;
      type?: string | null;
      actor?: string | null;
      entityType?: string | null;
      entityId?: string | null;
      limit?: number;
    }): Promise<CommissionerAuditProjection | null> {
      const options = await readBaseOptions(input);
      if (!options) {
        return null;
      }

      const limit = Math.max(1, Math.min(input.limit ?? 100, 200));
      const teamId = input.teamId?.trim() || null;
      const seasonId = options.context.season?.id ?? input.seasonId ?? null;
      const actorFilter = input.actor?.trim().toLowerCase() || null;
      const typeFilter = input.type?.trim() || null;
      const entityType = input.entityType?.trim() || null;
      const entityId = input.entityId?.trim() || null;
      const perSourceLimit = Math.max(limit, 100);

      const [
        phaseTransitions,
        overrides,
        complianceActions,
        transactions,
        tradeProposals,
        draftSelections,
        auctionAwards,
        syncMismatches,
      ] = await Promise.all([
        client.leaguePhaseTransition.findMany({
          where: {
            leagueId: input.leagueId,
            ...(seasonId ? { seasonId } : {}),
          },
          orderBy: [{ occurredAt: "desc" }],
          take: perSourceLimit,
          include: {
            initiatedByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
        client.commissionerOverride.findMany({
          where: {
            leagueId: input.leagueId,
            ...(seasonId ? { seasonId } : {}),
            ...(teamId ? { teamId } : {}),
          },
          orderBy: [{ createdAt: "desc" }],
          take: perSourceLimit,
          include: {
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            actorUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
        client.complianceAction.findMany({
          where: {
            issue: {
              leagueId: input.leagueId,
              ...(seasonId ? { seasonId } : {}),
              ...(teamId ? { teamId } : {}),
            },
          },
          orderBy: [{ createdAt: "desc" }],
          take: perSourceLimit,
          include: {
            actorUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            issue: {
              select: {
                id: true,
                title: true,
                code: true,
                issueType: true,
                status: true,
                team: {
                  select: {
                    id: true,
                    name: true,
                    abbreviation: true,
                  },
                },
              },
            },
          },
        }),
        client.transaction.findMany({
          where: {
            leagueId: input.leagueId,
            ...(seasonId ? { seasonId } : {}),
            ...(teamId ? { teamId } : {}),
          },
          orderBy: [{ createdAt: "desc" }],
          take: perSourceLimit,
          include: {
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        }),
        client.tradeProposal.findMany({
          where: {
            leagueId: input.leagueId,
            ...(seasonId ? { seasonId } : {}),
            ...(teamId
              ? {
                  OR: [{ proposerTeamId: teamId }, { counterpartyTeamId: teamId }],
                }
              : {}),
          },
          orderBy: [{ updatedAt: "desc" }],
          take: perSourceLimit,
          include: {
            proposerTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            counterpartyTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            createdByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            submittedByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            respondedByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            reviewedByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
            evaluations: {
              orderBy: [{ evaluatedAt: "desc" }],
              take: 1,
              select: {
                id: true,
                outcome: true,
                trigger: true,
                evaluatedAt: true,
              },
            },
          },
        }),
        client.draftSelection.findMany({
          where: {
            draft: {
              leagueId: input.leagueId,
              ...(seasonId ? { seasonId } : {}),
              type: "ROOKIE",
            },
            ...(teamId ? { selectingTeamId: teamId } : {}),
          },
          orderBy: [{ madeAt: "desc" }, { createdAt: "desc" }],
          take: perSourceLimit,
          include: {
            draft: {
              select: {
                id: true,
                title: true,
              },
            },
            selectingTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
              },
            },
            actedByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
        client.auctionAward.findMany({
          where: {
            leagueId: input.leagueId,
            ...(seasonId ? { seasonId } : {}),
            ...(teamId ? { awardedTeamId: teamId } : {}),
          },
          orderBy: [{ awardedAt: "desc" }],
          take: perSourceLimit,
          include: {
            draft: {
              select: {
                id: true,
                title: true,
              },
            },
            awardedTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
              },
            },
            createdByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
        client.syncMismatch.findMany({
          where: {
            leagueId: input.leagueId,
            ...(seasonId ? { seasonId } : {}),
            ...(teamId ? { teamId } : {}),
          },
          orderBy: [{ lastDetectedAt: "desc" }],
          take: perSourceLimit,
          include: {
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
              },
            },
            complianceIssue: {
              select: {
                id: true,
                title: true,
              },
            },
            resolvedByUser: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
      ]);

      const entries: CommissionerAuditEntrySummary[] = [
        ...phaseTransitions.map((transition) => ({
          id: encodeEntryId("phase_transition", transition.id),
          sourceKind: "phase_transition" as const,
          sourceId: transition.id,
          auditType: "lifecycle.phase_transition",
          occurredAt: transition.occurredAt.toISOString(),
          status: transition.transitionStatus,
          headline: `Phase changed to ${transition.toPhase}`,
          detail: `${transition.fromPhase} -> ${transition.toPhase}`,
          actor: buildActor({
            userId: transition.initiatedByUser?.id ?? null,
            email: transition.initiatedByUser?.email ?? null,
            name: transition.initiatedByUser?.name ?? null,
          }),
          team: null,
          relatedTeam: null,
          entity: {
            entityType: "season",
            entityId: transition.seasonId,
            label: transition.toPhase,
          },
        })),
        ...overrides.map((override) => ({
          id: encodeEntryId("commissioner_override", override.id),
          sourceKind: "commissioner_override" as const,
          sourceId: override.id,
          auditType: `commissioner.override.${override.overrideType.toLowerCase()}`,
          occurredAt: override.createdAt.toISOString(),
          status: override.status,
          headline: `${override.overrideType} override`,
          detail: override.reason,
          actor: buildActor({
            userId: override.actorUser?.id ?? null,
            email: override.actorUser?.email ?? null,
            name: override.actorUser?.name ?? null,
          }),
          team: override.team,
          relatedTeam: null,
          entity: {
            entityType: override.entityType,
            entityId: override.entityId,
            label: override.entityType,
          },
        })),
        ...complianceActions.map((action) => ({
          id: encodeEntryId("compliance_action", action.id),
          sourceKind: "compliance_action" as const,
          sourceId: action.id,
          auditType: `compliance.action.${action.actionType.toLowerCase()}`,
          occurredAt: action.createdAt.toISOString(),
          status: action.toStatus ?? action.issue.status,
          headline: action.summary,
          detail: action.notes ?? action.issue.title,
          actor: buildActor({
            userId: action.actorUser?.id ?? null,
            email: action.actorUser?.email ?? null,
            name: action.actorUser?.name ?? null,
          }),
          team: action.issue.team,
          relatedTeam: null,
          entity: {
            entityType: "compliance_issue",
            entityId: action.issue.id,
            label: action.issue.title,
          },
        })),
        ...transactions.map((transaction) => {
          const audit = parseTransactionAuditMetadata(transaction.metadata);
          return {
            id: encodeEntryId("transaction", transaction.id),
            sourceKind: "transaction" as const,
            sourceId: transaction.id,
            auditType: `transaction.${transaction.type.toLowerCase()}`,
            occurredAt: transaction.createdAt.toISOString(),
            status: null,
            headline: transaction.summary,
            detail: audit?.source ?? transaction.type,
            actor: buildActor({
              userId: null,
              email: audit?.actor?.email ?? null,
              name: null,
              leagueRole: audit?.actor?.leagueRole ?? null,
            }),
            team: transaction.team,
            relatedTeam: null,
            entity: transaction.player
              ? {
                  entityType: "player",
                  entityId: transaction.player.id,
                  label: transaction.player.name,
                }
              : null,
          };
        }),
        ...tradeProposals.map((proposal) => {
          const actor =
            proposal.reviewedByUser ??
            proposal.respondedByUser ??
            proposal.submittedByUser ??
            proposal.createdByUser;
          return {
            id: encodeEntryId("trade_proposal", proposal.id),
            sourceKind: "trade_proposal" as const,
            sourceId: proposal.id,
            auditType: `trade.proposal.${proposal.status.toLowerCase()}`,
            occurredAt:
              proposal.reviewedAt?.toISOString() ??
              proposal.counterpartyRespondedAt?.toISOString() ??
              proposal.submittedAt?.toISOString() ??
              proposal.updatedAt.toISOString(),
            status: proposal.status,
            headline: `${proposal.proposerTeam.name} vs ${proposal.counterpartyTeam.name}`,
            detail:
              proposal.evaluations[0]
                ? `Latest evaluation: ${proposal.evaluations[0].outcome}`
                : "No stored evaluation snapshot.",
            actor: buildActor({
              userId: actor?.id ?? null,
              email: actor?.email ?? null,
              name: actor?.name ?? null,
            }),
            team: proposal.proposerTeam,
            relatedTeam: proposal.counterpartyTeam,
            entity: {
              entityType: "trade_proposal",
              entityId: proposal.id,
              label: proposal.status,
            },
          };
        }),
        ...draftSelections.map((selection) => ({
          id: encodeEntryId("draft_selection", selection.id),
          sourceKind: "draft_selection" as const,
          sourceId: selection.id,
          auditType: `draft.rookie.${selection.outcome.toLowerCase()}`,
          occurredAt: (selection.madeAt ?? selection.createdAt).toISOString(),
          status: selection.outcome,
          headline: `${selection.draft.title} pick ${selection.round}.${String(selection.pickNumber).padStart(2, "0")}`,
          detail:
            selection.outcome === "SELECTED"
              ? `${selection.selectingTeam.name} selected ${selection.player?.name ?? "a player"}.`
              : `${selection.selectingTeam.name} ${selection.outcome.toLowerCase()} pick ${selection.round}.${String(selection.pickNumber).padStart(2, "0")}.`,
          actor: buildActor({
            userId: selection.actedByUser?.id ?? null,
            email: selection.actedByUser?.email ?? null,
            name: selection.actedByUser?.name ?? null,
          }),
          team: selection.selectingTeam,
          relatedTeam: null,
          entity: {
            entityType: "draft_selection",
            entityId: selection.id,
            label: selection.player?.name ?? selection.outcome,
          },
        })),
        ...auctionAwards.map((award) => ({
          id: encodeEntryId("auction_award", award.id),
          sourceKind: "auction_award" as const,
          sourceId: award.id,
          auditType: "auction.award",
          occurredAt: award.awardedAt.toISOString(),
          status: award.status,
          headline: `${award.player.name} awarded to ${award.awardedTeam.name}`,
          detail: `$${award.salaryAmount} for ${award.contractYears} year${award.contractYears === 1 ? "" : "s"}`,
          actor: buildActor({
            userId: award.createdByUser?.id ?? null,
            email: award.createdByUser?.email ?? null,
            name: award.createdByUser?.name ?? null,
          }),
          team: award.awardedTeam,
          relatedTeam: null,
          entity: {
            entityType: "auction_award",
            entityId: award.id,
            label: award.player.name,
          },
        })),
        ...syncMismatches.map((mismatch) => ({
          id: encodeEntryId("sync_mismatch", mismatch.id),
          sourceKind: "sync_mismatch" as const,
          sourceId: mismatch.id,
          auditType: `sync.mismatch.${mismatch.status.toLowerCase()}`,
          occurredAt: mismatch.lastDetectedAt.toISOString(),
          status: mismatch.status,
          headline: mismatch.title,
          detail: mismatch.message,
          actor: buildActor({
            userId: mismatch.resolvedByUser?.id ?? null,
            email: mismatch.resolvedByUser?.email ?? null,
            name: mismatch.resolvedByUser?.name ?? null,
          }),
          team: mismatch.team,
          relatedTeam: null,
          entity: {
            entityType: "sync_mismatch",
            entityId: mismatch.id,
            label: mismatch.mismatchType,
          },
        })),
      ]
        .filter((entry) => !typeFilter || entry.auditType === typeFilter)
        .filter((entry) => matchesActorFilter(entry, actorFilter))
        .filter((entry) => matchesEntityFilter(entry, entityType, entityId))
        .sort(sortEntriesDesc);

      const byType = entries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.auditType] = (acc[entry.auditType] ?? 0) + 1;
        return acc;
      }, {});
      const bySourceKind = entries.reduce<Record<string, number>>((acc, entry) => {
        acc[entry.sourceKind] = (acc[entry.sourceKind] ?? 0) + 1;
        return acc;
      }, {});

      return {
        league: {
          id: options.context.league.id,
          name: options.context.league.name,
        },
        season: {
          id: options.context.season?.id ?? null,
          year: options.context.season?.year ?? null,
        },
        filters: {
          seasonId,
          teamId,
          type: typeFilter,
          actor: actorFilter,
          entityType,
          entityId,
          limit,
        },
        summary: {
          total: entries.length,
          byType,
          bySourceKind,
        },
        seasons: options.seasons.map((season) => ({
          id: season.id,
          year: season.year,
          status: season.status,
          phase: season.phase,
        })),
        teams: options.teams,
        entries: entries.slice(0, limit),
      };
    },

    async readDetail(input: {
      leagueId: string;
      seasonId?: string | null;
      entryId: string;
    }): Promise<CommissionerAuditEntryDetail | null> {
      const decoded = decodeEntryId(input.entryId);
      if (!decoded) {
        return null;
      }

      switch (decoded.sourceKind) {
        case "phase_transition": {
          const transition = await client.leaguePhaseTransition.findFirst({
            where: {
              id: decoded.sourceId,
              leagueId: input.leagueId,
              ...(input.seasonId ? { seasonId: input.seasonId } : {}),
            },
            include: {
              initiatedByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          });

          if (!transition) return null;

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "phase_transition",
            sourceId: transition.id,
            auditType: "lifecycle.phase_transition",
            occurredAt: transition.occurredAt.toISOString(),
            status: transition.transitionStatus,
            headline: `Phase changed to ${transition.toPhase}`,
            detail: `${transition.fromPhase} -> ${transition.toPhase}`,
            actor: buildActor({
              userId: transition.initiatedByUser?.id ?? null,
              email: transition.initiatedByUser?.email ?? null,
              name: transition.initiatedByUser?.name ?? null,
            }),
            team: null,
            relatedTeam: null,
            entity: {
              entityType: "season",
              entityId: transition.seasonId,
              label: transition.toPhase,
            },
          };

          return {
            ...summary,
            sourceRecord: {
              fromPhase: transition.fromPhase,
              toPhase: transition.toPhase,
              initiatedByType: transition.initiatedByType,
              reason: transition.reason,
            },
            sections: buildSections([
              {
                label: "Transition",
                value: {
                  fromPhase: transition.fromPhase,
                  toPhase: transition.toPhase,
                  initiatedByType: transition.initiatedByType,
                  reason: transition.reason,
                },
              },
            ]),
          };
        }

        case "commissioner_override": {
          const override = await client.commissionerOverride.findFirst({
            where: {
              id: decoded.sourceId,
              leagueId: input.leagueId,
              ...(input.seasonId ? { seasonId: input.seasonId } : {}),
            },
            include: {
              team: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              actorUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          });

          if (!override) return null;

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "commissioner_override",
            sourceId: override.id,
            auditType: `commissioner.override.${override.overrideType.toLowerCase()}`,
            occurredAt: override.createdAt.toISOString(),
            status: override.status,
            headline: `${override.overrideType} override`,
            detail: override.reason,
            actor: buildActor({
              userId: override.actorUser?.id ?? null,
              email: override.actorUser?.email ?? null,
              name: override.actorUser?.name ?? null,
            }),
            team: override.team,
            relatedTeam: null,
            entity: {
              entityType: override.entityType,
              entityId: override.entityId,
              label: override.entityType,
            },
          };

          return {
            ...summary,
            sourceRecord: {
              reason: override.reason,
              beforeJson: override.beforeJson,
              afterJson: override.afterJson,
              metadata: override.metadata,
            },
            sections: buildSections([
              {
                label: "Reason",
                value: {
                  reason: override.reason,
                },
              },
              {
                label: "Before",
                value: isRecord(override.beforeJson) ? override.beforeJson : null,
              },
              {
                label: "After",
                value: isRecord(override.afterJson) ? override.afterJson : null,
              },
              {
                label: "Metadata",
                value: isRecord(override.metadata) ? override.metadata : null,
              },
            ]),
          };
        }

        case "compliance_action": {
          const action = await client.complianceAction.findUnique({
            where: {
              id: decoded.sourceId,
            },
            include: {
              actorUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
              issue: {
                include: {
                  team: {
                    select: {
                      id: true,
                      name: true,
                      abbreviation: true,
                    },
                  },
                },
              },
            },
          });

          if (!action || action.issue.leagueId !== input.leagueId) return null;
          if (input.seasonId && action.issue.seasonId !== input.seasonId) return null;

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "compliance_action",
            sourceId: action.id,
            auditType: `compliance.action.${action.actionType.toLowerCase()}`,
            occurredAt: action.createdAt.toISOString(),
            status: action.toStatus ?? action.issue.status,
            headline: action.summary,
            detail: action.notes ?? action.issue.title,
            actor: buildActor({
              userId: action.actorUser?.id ?? null,
              email: action.actorUser?.email ?? null,
              name: action.actorUser?.name ?? null,
            }),
            team: action.issue.team,
            relatedTeam: null,
            entity: {
              entityType: "compliance_issue",
              entityId: action.issue.id,
              label: action.issue.title,
            },
          };

          return {
            ...summary,
            sourceRecord: {
              summary: action.summary,
              notes: action.notes,
              toStatus: action.toStatus,
              metadata: action.metadata,
              issue: {
                id: action.issue.id,
                title: action.issue.title,
                code: action.issue.code,
                status: action.issue.status,
              },
            },
            sections: buildSections([
              {
                label: "Action",
                value: {
                  summary: action.summary,
                  notes: action.notes,
                  toStatus: action.toStatus,
                },
              },
              {
                label: "Metadata",
                value: isRecord(action.metadata) ? action.metadata : null,
              },
            ]),
          };
        }

        case "transaction": {
          const transaction = await client.transaction.findFirst({
            where: {
              id: decoded.sourceId,
              leagueId: input.leagueId,
              ...(input.seasonId ? { seasonId: input.seasonId } : {}),
            },
            include: {
              team: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              player: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          });

          if (!transaction) return null;
          const audit = parseTransactionAuditMetadata(transaction.metadata);

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "transaction",
            sourceId: transaction.id,
            auditType: `transaction.${transaction.type.toLowerCase()}`,
            occurredAt: transaction.createdAt.toISOString(),
            status: null,
            headline: transaction.summary,
            detail: audit?.source ?? transaction.type,
            actor: buildActor({
              email: audit?.actor?.email ?? null,
              leagueRole: audit?.actor?.leagueRole ?? null,
            }),
            team: transaction.team,
            relatedTeam: null,
            entity: transaction.player
              ? {
                  entityType: "player",
                  entityId: transaction.player.id,
                  label: transaction.player.name,
                }
              : null,
          };

          return {
            ...summary,
            sourceRecord: {
              summary: transaction.summary,
              type: transaction.type,
              metadata: transaction.metadata,
            },
            sections: buildSections([
              {
                label: "Audit",
                value: audit
                  ? {
                      source: audit.source,
                      actor: audit.actor,
                      entities: audit.entities,
                    }
                  : null,
              },
              {
                label: "Before",
                value: audit?.before ?? null,
              },
              {
                label: "After",
                value: audit?.after ?? null,
              },
              {
                label: "Details",
                value: isRecord(audit?.details) ? audit.details : null,
              },
            ]),
          };
        }

        case "trade_proposal": {
          const proposal = await client.tradeProposal.findFirst({
            where: {
              id: decoded.sourceId,
              leagueId: input.leagueId,
              ...(input.seasonId ? { seasonId: input.seasonId } : {}),
            },
            include: {
              proposerTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              counterpartyTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              createdByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
              submittedByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
              respondedByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
              reviewedByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
              evaluations: {
                orderBy: [{ evaluatedAt: "desc" }],
                select: {
                  id: true,
                  outcome: true,
                  trigger: true,
                  assetFingerprint: true,
                  findingsJson: true,
                  remediationJson: true,
                  postTradeProjectionJson: true,
                  evaluatedAt: true,
                  isSubmissionSnapshot: true,
                },
              },
            },
          });

          if (!proposal) return null;
          const actor =
            proposal.reviewedByUser ??
            proposal.respondedByUser ??
            proposal.submittedByUser ??
            proposal.createdByUser;

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "trade_proposal",
            sourceId: proposal.id,
            auditType: `trade.proposal.${proposal.status.toLowerCase()}`,
            occurredAt:
              proposal.reviewedAt?.toISOString() ??
              proposal.counterpartyRespondedAt?.toISOString() ??
              proposal.submittedAt?.toISOString() ??
              proposal.updatedAt.toISOString(),
            status: proposal.status,
            headline: `${proposal.proposerTeam.name} vs ${proposal.counterpartyTeam.name}`,
            detail:
              proposal.evaluations[0]
                ? `Latest evaluation: ${proposal.evaluations[0].outcome}`
                : "No stored evaluation snapshot.",
            actor: buildActor({
              userId: actor?.id ?? null,
              email: actor?.email ?? null,
              name: actor?.name ?? null,
            }),
            team: proposal.proposerTeam,
            relatedTeam: proposal.counterpartyTeam,
            entity: {
              entityType: "trade_proposal",
              entityId: proposal.id,
              label: proposal.status,
            },
          };

          const latestEvaluation = proposal.evaluations[0] ?? null;

          return {
            ...summary,
            sourceRecord: {
              status: proposal.status,
              submittedAt: proposal.submittedAt?.toISOString() ?? null,
              counterpartyRespondedAt: proposal.counterpartyRespondedAt?.toISOString() ?? null,
              reviewedAt: proposal.reviewedAt?.toISOString() ?? null,
            },
            sections: buildSections([
              {
                label: "Proposal",
                value: {
                  status: proposal.status,
                  proposerTeam: proposal.proposerTeam.name,
                  counterpartyTeam: proposal.counterpartyTeam.name,
                  submittedAt: proposal.submittedAt?.toISOString() ?? null,
                  counterpartyRespondedAt: proposal.counterpartyRespondedAt?.toISOString() ?? null,
                  reviewedAt: proposal.reviewedAt?.toISOString() ?? null,
                },
              },
              {
                label: "Latest evaluation",
                value: latestEvaluation
                  ? {
                      id: latestEvaluation.id,
                      outcome: latestEvaluation.outcome,
                      trigger: latestEvaluation.trigger,
                      assetFingerprint: latestEvaluation.assetFingerprint,
                      findings: latestEvaluation.findingsJson,
                      remediation: latestEvaluation.remediationJson,
                      postTradeProjection: latestEvaluation.postTradeProjectionJson,
                      evaluatedAt: latestEvaluation.evaluatedAt.toISOString(),
                      isSubmissionSnapshot: latestEvaluation.isSubmissionSnapshot,
                    }
                  : null,
              },
            ]),
          };
        }

        case "draft_selection": {
          const selection = await client.draftSelection.findFirst({
            where: {
              id: decoded.sourceId,
              draft: {
                leagueId: input.leagueId,
                ...(input.seasonId ? { seasonId: input.seasonId } : {}),
              },
            },
            include: {
              draft: {
                select: {
                  id: true,
                  title: true,
                },
              },
              selectingTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              player: {
                select: {
                  id: true,
                  name: true,
                },
              },
              actedByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          });

          if (!selection) return null;

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "draft_selection",
            sourceId: selection.id,
            auditType: `draft.rookie.${selection.outcome.toLowerCase()}`,
            occurredAt: (selection.madeAt ?? selection.createdAt).toISOString(),
            status: selection.outcome,
            headline: `${selection.draft.title} pick ${selection.round}.${String(selection.pickNumber).padStart(2, "0")}`,
            detail:
              selection.outcome === "SELECTED"
                ? `${selection.selectingTeam.name} selected ${selection.player?.name ?? "a player"}.`
                : `${selection.selectingTeam.name} ${selection.outcome.toLowerCase()} pick ${selection.round}.${String(selection.pickNumber).padStart(2, "0")}.`,
            actor: buildActor({
              userId: selection.actedByUser?.id ?? null,
              email: selection.actedByUser?.email ?? null,
              name: selection.actedByUser?.name ?? null,
            }),
            team: selection.selectingTeam,
            relatedTeam: null,
            entity: {
              entityType: "draft_selection",
              entityId: selection.id,
              label: selection.player?.name ?? selection.outcome,
            },
          };

          return {
            ...summary,
            sourceRecord: {
              round: selection.round,
              pickNumber: selection.pickNumber,
              outcome: selection.outcome,
              salary: selection.salary,
              contractYears: selection.contractYears,
              contractId: selection.contractId,
              rosterAssignmentId: selection.rosterAssignmentId,
            },
            sections: buildSections([
              {
                label: "Selection",
                value: {
                  round: selection.round,
                  pickNumber: selection.pickNumber,
                  outcome: selection.outcome,
                  salary: selection.salary,
                  contractYears: selection.contractYears,
                  contractId: selection.contractId,
                  rosterAssignmentId: selection.rosterAssignmentId,
                },
              },
            ]),
          };
        }

        case "auction_award": {
          const award = await client.auctionAward.findFirst({
            where: {
              id: decoded.sourceId,
              leagueId: input.leagueId,
              ...(input.seasonId ? { seasonId: input.seasonId } : {}),
            },
            include: {
              draft: {
                select: {
                  id: true,
                  title: true,
                },
              },
              awardedTeam: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              player: {
                select: {
                  id: true,
                  name: true,
                },
              },
              createdByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
              winningBid: {
                select: {
                  id: true,
                  biddingTeamId: true,
                  bidType: true,
                  salaryAmount: true,
                  contractYears: true,
                  submittedAt: true,
                },
              },
            },
          });

          if (!award) return null;

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "auction_award",
            sourceId: award.id,
            auditType: "auction.award",
            occurredAt: award.awardedAt.toISOString(),
            status: award.status,
            headline: `${award.player.name} awarded to ${award.awardedTeam.name}`,
            detail: `$${award.salaryAmount} for ${award.contractYears} year${award.contractYears === 1 ? "" : "s"}`,
            actor: buildActor({
              userId: award.createdByUser?.id ?? null,
              email: award.createdByUser?.email ?? null,
              name: award.createdByUser?.name ?? null,
            }),
            team: award.awardedTeam,
            relatedTeam: null,
            entity: {
              entityType: "auction_award",
              entityId: award.id,
              label: award.player.name,
            },
          };

          return {
            ...summary,
            sourceRecord: {
              draftId: award.draftId,
              status: award.status,
              acquisitionType: award.acquisitionType,
              contractId: award.contractId,
              rosterAssignmentId: award.rosterAssignmentId,
              winningBid: award.winningBid,
            },
            sections: buildSections([
              {
                label: "Award",
                value: {
                  draftTitle: award.draft.title,
                  status: award.status,
                  acquisitionType: award.acquisitionType,
                  contractId: award.contractId,
                  rosterAssignmentId: award.rosterAssignmentId,
                  winningBid: award.winningBid,
                },
              },
            ]),
          };
        }

        case "sync_mismatch": {
          const mismatch = await client.syncMismatch.findFirst({
            where: {
              id: decoded.sourceId,
              leagueId: input.leagueId,
              ...(input.seasonId ? { seasonId: input.seasonId } : {}),
            },
            include: {
              team: {
                select: {
                  id: true,
                  name: true,
                  abbreviation: true,
                },
              },
              player: {
                select: {
                  id: true,
                  name: true,
                },
              },
              complianceIssue: {
                select: {
                  id: true,
                  title: true,
                },
              },
              resolvedByUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
              job: {
                select: {
                  id: true,
                  jobType: true,
                  status: true,
                  trigger: true,
                  adapterKey: true,
                  sourceLabel: true,
                  createdAt: true,
                },
              },
            },
          });

          if (!mismatch) return null;

          const summary: CommissionerAuditEntrySummary = {
            id: input.entryId,
            sourceKind: "sync_mismatch",
            sourceId: mismatch.id,
            auditType: `sync.mismatch.${mismatch.status.toLowerCase()}`,
            occurredAt: mismatch.lastDetectedAt.toISOString(),
            status: mismatch.status,
            headline: mismatch.title,
            detail: mismatch.message,
            actor: buildActor({
              userId: mismatch.resolvedByUser?.id ?? null,
              email: mismatch.resolvedByUser?.email ?? null,
              name: mismatch.resolvedByUser?.name ?? null,
            }),
            team: mismatch.team,
            relatedTeam: null,
            entity: {
              entityType: "sync_mismatch",
              entityId: mismatch.id,
              label: mismatch.mismatchType,
            },
          };

          return {
            ...summary,
            sourceRecord: {
              mismatchType: mismatch.mismatchType,
              severity: mismatch.severity,
              resolutionType: mismatch.resolutionType,
              resolutionReason: mismatch.resolutionReason,
              hostValue: mismatch.hostValueJson,
              dynastyValue: mismatch.dynastyValueJson,
              metadata: mismatch.metadataJson,
              job: mismatch.job,
            },
            sections: buildSections([
              {
                label: "Mismatch",
                value: {
                  mismatchType: mismatch.mismatchType,
                  severity: mismatch.severity,
                  resolutionType: mismatch.resolutionType,
                  resolutionReason: mismatch.resolutionReason,
                },
              },
              {
                label: "Host value",
                value: isRecord(mismatch.hostValueJson) ? mismatch.hostValueJson : null,
              },
              {
                label: "Dynasty value",
                value: isRecord(mismatch.dynastyValueJson) ? mismatch.dynastyValueJson : null,
              },
              {
                label: "Metadata",
                value: isRecord(mismatch.metadataJson) ? mismatch.metadataJson : null,
              },
            ]),
          };
        }
      }
    },
  };
}
