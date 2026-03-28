import { ComplianceIssueStatus, Prisma, PrismaClient } from "@prisma/client";
import { toLegacySeverity } from "@/lib/domain/compliance/shared";
import { toRemediationRecord } from "@/lib/compliance/remediation";
import { prisma } from "@/lib/prisma";

type ComplianceReadDbClient = PrismaClient | Prisma.TransactionClient;

function isOpenStatus(status: ComplianceIssueStatus) {
  return status === "OPEN" || status === "IN_REVIEW";
}

export function createComplianceReadModels(
  client: ComplianceReadDbClient = prisma,
) {
  return {
    async readComplianceQueue(input: {
      leagueId: string;
      seasonId: string;
    }) {
      const issues = await client.complianceIssue.findMany({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          status: {
            in: ["OPEN", "IN_REVIEW"],
          },
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
          actions: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              id: true,
              actionType: true,
              summary: true,
              createdAt: true,
            },
          },
          overrides: {
            orderBy: {
              createdAt: "desc",
            },
            take: 1,
            select: {
              id: true,
              overrideType: true,
              createdAt: true,
            },
          },
        },
        orderBy: [
          {
            severity: "desc",
          },
          {
            dueAt: "asc",
          },
          {
            createdAt: "desc",
          },
        ],
      });

      const remediationRecords = issues
        .filter((issue) => issue.team && issue.ruleCode && issue.dueAt && isOpenStatus(issue.status))
        .map((issue) =>
          toRemediationRecord({
            id: issue.id,
            teamId: issue.team!.id,
            teamName: issue.team!.name,
            ruleCode: issue.ruleCode!,
            message: issue.message,
            severity: toLegacySeverity(issue.severity),
            dueAt: issue.dueAt!.toISOString(),
            metadata: issue.metadata,
            updatedAt: issue.updatedAt.toISOString(),
          }),
        );

      return {
        summary: {
          open: issues.filter((issue) => issue.status === "OPEN").length,
          inReview: issues.filter((issue) => issue.status === "IN_REVIEW").length,
          error: issues.filter((issue) => issue.severity === "ERROR").length,
          warning: issues.filter((issue) => issue.severity === "WARNING").length,
          critical: issues.filter((issue) => issue.severity === "CRITICAL").length,
        },
        issues: issues.map((issue) => ({
          id: issue.id,
          teamId: issue.teamId,
          teamName: issue.team?.name ?? null,
          source: issue.source,
          issueType: issue.issueType,
          severity: issue.severity,
          status: issue.status,
          code: issue.code,
          ruleCode: issue.ruleCode,
          title: issue.title,
          message: issue.message,
          dueAt: issue.dueAt?.toISOString() ?? null,
          overdue: issue.dueAt ? issue.dueAt.getTime() < Date.now() : false,
          updatedAt: issue.updatedAt.toISOString(),
          latestAction: issue.actions[0]
            ? {
                id: issue.actions[0].id,
                actionType: issue.actions[0].actionType,
                summary: issue.actions[0].summary,
                createdAt: issue.actions[0].createdAt.toISOString(),
              }
            : null,
          latestOverride: issue.overrides[0]
            ? {
                id: issue.overrides[0].id,
                overrideType: issue.overrides[0].overrideType,
                createdAt: issue.overrides[0].createdAt.toISOString(),
              }
            : null,
        })),
        remediationRecords,
      };
    },

    async readIssueDetail(input: {
      leagueId: string;
      issueId: string;
    }) {
      const issue = await client.complianceIssue.findFirst({
        where: {
          id: input.issueId,
          leagueId: input.leagueId,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
          player: {
            select: {
              id: true,
              name: true,
            },
          },
          contract: {
            select: {
              id: true,
            },
          },
          deadline: {
            select: {
              id: true,
              deadlineType: true,
              phase: true,
              scheduledAt: true,
            },
          },
          actions: {
            orderBy: {
              createdAt: "asc",
            },
            include: {
              actorUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
          overrides: {
            orderBy: {
              createdAt: "desc",
            },
            include: {
              actorUser: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!issue) {
        return null;
      }

      return {
        issue: {
          id: issue.id,
          leagueId: issue.leagueId,
          seasonId: issue.seasonId,
          teamId: issue.teamId,
          teamName: issue.team?.name ?? null,
          playerId: issue.playerId,
          playerName: issue.player?.name ?? null,
          contractId: issue.contractId,
          source: issue.source,
          issueType: issue.issueType,
          severity: issue.severity,
          status: issue.status,
          code: issue.code,
          ruleCode: issue.ruleCode,
          title: issue.title,
          message: issue.message,
          dueAt: issue.dueAt?.toISOString() ?? null,
          dueAtBasis: issue.dueAtBasis,
          dueAtReason: issue.dueAtReason,
          resolvedAt: issue.resolvedAt?.toISOString() ?? null,
          metadata: issue.metadata,
          deadline: issue.deadline
            ? {
                id: issue.deadline.id,
                deadlineType: issue.deadline.deadlineType,
                phase: issue.deadline.phase,
                scheduledAt: issue.deadline.scheduledAt.toISOString(),
              }
            : null,
          createdAt: issue.createdAt.toISOString(),
          updatedAt: issue.updatedAt.toISOString(),
        },
        remediationRecord:
          issue.team && issue.ruleCode && issue.dueAt && isOpenStatus(issue.status)
            ? toRemediationRecord({
                id: issue.id,
                teamId: issue.team.id,
                teamName: issue.team.name,
                ruleCode: issue.ruleCode,
                message: issue.message,
                severity: toLegacySeverity(issue.severity),
                dueAt: issue.dueAt.toISOString(),
                metadata: issue.metadata,
                updatedAt: issue.updatedAt.toISOString(),
              })
            : null,
        actions: issue.actions.map((action) => ({
          id: action.id,
          actionType: action.actionType,
          toStatus: action.toStatus,
          summary: action.summary,
          notes: action.notes,
          metadata: action.metadata,
          createdAt: action.createdAt.toISOString(),
          actorUser: action.actorUser
            ? {
                id: action.actorUser.id,
                email: action.actorUser.email,
                name: action.actorUser.name,
              }
            : null,
        })),
        overrides: issue.overrides.map((override) => ({
          id: override.id,
          overrideType: override.overrideType,
          status: override.status,
          reason: override.reason,
          entityType: override.entityType,
          entityId: override.entityId,
          beforeJson: override.beforeJson,
          afterJson: override.afterJson,
          metadata: override.metadata,
          createdAt: override.createdAt.toISOString(),
          actorUser: override.actorUser
            ? {
                id: override.actorUser.id,
                email: override.actorUser.email,
                name: override.actorUser.name,
              }
            : null,
        })),
      };
    },

    async readOverrideHistory(input: {
      leagueId: string;
      seasonId: string;
    }) {
      const overrides = await client.commissionerOverride.findMany({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
            },
          },
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
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return {
        overrides: overrides.map((override) => ({
          id: override.id,
          teamId: override.teamId,
          teamName: override.team?.name ?? null,
          issueId: override.issueId,
          issueTitle: override.issue?.title ?? null,
          issueCode: override.issue?.code ?? null,
          overrideType: override.overrideType,
          status: override.status,
          reason: override.reason,
          entityType: override.entityType,
          entityId: override.entityId,
          metadata: override.metadata,
          beforeJson: override.beforeJson,
          afterJson: override.afterJson,
          createdAt: override.createdAt.toISOString(),
          updatedAt: override.updatedAt.toISOString(),
          actorUser: override.actorUser
            ? {
                id: override.actorUser.id,
                email: override.actorUser.email,
                name: override.actorUser.name,
              }
            : null,
        })),
      };
    },
  };
}
