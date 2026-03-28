import {
  ComplianceDueAtBasis,
  ComplianceIssueSeverity,
  ComplianceIssueType,
  LeaguePhase,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ComplianceDueTimeDbClient = PrismaClient | Prisma.TransactionClient;

export type ComplianceDueTimeResult = {
  dueAt: Date | null;
  basis: ComplianceDueAtBasis | null;
  reason: string | null;
  leagueDeadlineId: string | null;
};

function phaseWindowHours(phase: LeaguePhase, severity: ComplianceIssueSeverity) {
  if (phase === "REGULAR_SEASON") {
    return severity === "CRITICAL" ? 12 : 24;
  }

  if (phase === "OFFSEASON_ROLLOVER" || phase === "TAG_OPTION_COMPLIANCE") {
    return severity === "CRITICAL" ? 24 : 48;
  }

  return severity === "CRITICAL" ? 24 : 48;
}

export function createComplianceDueTimeCalculator(
  client: ComplianceDueTimeDbClient = prisma,
) {
  return {
    async calculate(input: {
      leagueId: string;
      seasonId: string;
      issueType: ComplianceIssueType;
      severity: ComplianceIssueSeverity;
      explicitDueAt?: Date | string | null;
      deadlineType?: string | null;
      now?: Date;
      scoringWindowEndsAt?: Date | string | null;
    }): Promise<ComplianceDueTimeResult> {
      const now = input.now ?? new Date();

      if (input.explicitDueAt) {
        const dueAt =
          input.explicitDueAt instanceof Date ? input.explicitDueAt : new Date(input.explicitDueAt);
        if (!Number.isNaN(dueAt.getTime())) {
          return {
            dueAt,
            basis: "MANUAL",
            reason: "Explicit dueAt provided.",
            leagueDeadlineId: null,
          };
        }
      }

      const season = await client.season.findFirst({
        where: {
          id: input.seasonId,
          leagueId: input.leagueId,
        },
        select: {
          id: true,
          phase: true,
        },
      });

      if (!season) {
        return {
          dueAt: null,
          basis: null,
          reason: null,
          leagueDeadlineId: null,
        };
      }

      const deadline = await client.leagueDeadline.findFirst({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          ...(input.deadlineType ? { deadlineType: input.deadlineType } : { phase: season.phase }),
        },
        orderBy: {
          scheduledAt: "asc",
        },
        select: {
          id: true,
          deadlineType: true,
          scheduledAt: true,
        },
      });

      if (deadline) {
        return {
          dueAt: deadline.scheduledAt,
          basis: "DEADLINE",
          reason: `Bound to ${deadline.deadlineType} deadline.`,
          leagueDeadlineId: deadline.id,
        };
      }

      if (season.phase === "REGULAR_SEASON" && input.scoringWindowEndsAt) {
        const scoringWindowEndsAt =
          input.scoringWindowEndsAt instanceof Date
            ? input.scoringWindowEndsAt
            : new Date(input.scoringWindowEndsAt);
        if (!Number.isNaN(scoringWindowEndsAt.getTime())) {
          const fallbackDueAt = new Date(now.getTime() + phaseWindowHours(season.phase, input.severity) * 3_600_000);
          return {
            dueAt: scoringWindowEndsAt < fallbackDueAt ? scoringWindowEndsAt : fallbackDueAt,
            basis: "SCORING_WINDOW",
            reason: "Regular-season scoring window fallback applied.",
            leagueDeadlineId: null,
          };
        }
      }

      const dueAt = new Date(now.getTime() + phaseWindowHours(season.phase, input.severity) * 3_600_000);
      return {
        dueAt,
        basis: "PHASE_WINDOW",
        reason: `Default ${season.phase.toLowerCase()} phase window applied for ${input.issueType.toLowerCase()}.`,
        leagueDeadlineId: null,
      };
    },
  };
}
