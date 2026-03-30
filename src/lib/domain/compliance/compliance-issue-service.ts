import {
  ComplianceActionType,
  ComplianceIssue,
  ComplianceIssueSeverity,
  ComplianceIssueStatus,
  ComplianceIssueType,
  LeagueRole,
  Prisma,
  PrismaClient,
} from "@prisma/client";
import {
  buildDefaultRemediationMetadata,
  normalizeRemediationMetadata,
} from "@/lib/compliance/remediation";
import { evaluateLeagueCompliance, evaluateTeamCompliance } from "@/lib/compliance/service";
import { prisma } from "@/lib/prisma";
import { LeagueComplianceReport, RuleResult, TeamComplianceReport } from "@/types/compliance";
import { createComplianceDueTimeCalculator } from "@/lib/domain/compliance/compliance-due-time-calculator";
import { createComplianceNotificationService } from "@/lib/domain/compliance/compliance-notification-service";
import {
  buildDeadlineIssueFingerprint,
  buildDeadlineIssueMessage,
  buildDeadlineIssueTitle,
  buildManualIssueFingerprint,
  buildRuleIssueFingerprint,
  buildRuleIssueMessage,
  buildRuleIssueTitle,
  issueTypeFromRuleCode,
  toIssueSeverity,
} from "@/lib/domain/compliance/shared";

type ComplianceIssueDbClient = PrismaClient | Prisma.TransactionClient;

type OpenIssue = Pick<
  ComplianceIssue,
  | "id"
  | "leagueId"
  | "seasonId"
  | "teamId"
  | "playerId"
  | "contractId"
  | "leagueDeadlineId"
  | "source"
  | "issueType"
  | "severity"
  | "status"
  | "code"
  | "ruleCode"
  | "title"
  | "message"
  | "fingerprint"
  | "dueAt"
  | "dueAtBasis"
  | "dueAtReason"
  | "resolvedAt"
  | "metadata"
  | "createdAt"
  | "updatedAt"
>;

const SYNCABLE_RULE_STATUSES: ComplianceIssueStatus[] = ["OPEN", "IN_REVIEW"];
const NOTIFIABLE_WARNING_RULE_CODES = new Set<string>([
  "CAP_SOFT_EXCEEDED",
  "ROSTER_BELOW_TARGET",
  "STARTER_COUNT_MISMATCH",
  "STARTER_SLOT_INVALID",
  "STARTER_POSITION_INVALID",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function mergeIssueMetadata(input: {
  issueId: string;
  ruleCode: string;
  metadata: Prisma.JsonValue | null;
  findingContext?: Record<string, unknown> | null;
}) {
  const current = isRecord(input.metadata) ? input.metadata : {};
  const remediation = normalizeRemediationMetadata({
    id: input.issueId,
    ruleCode: input.ruleCode,
    metadata: isRecord(current.remediation) ? current.remediation : current,
  });

  return {
    ...current,
    findingContext: input.findingContext ?? null,
    remediation,
  } as Prisma.InputJsonValue;
}

async function createIssueAction(
  client: ComplianceIssueDbClient,
  input: {
    issueId: string;
    actorUserId?: string | null;
    actorRoleSnapshot?: LeagueRole | null;
    actionType: ComplianceActionType;
    summary: string;
    notes?: string | null;
    metadata?: Prisma.InputJsonValue;
    toStatus?: ComplianceIssueStatus;
  },
) {
  if (input.toStatus) {
    await client.complianceIssue.update({
      where: { id: input.issueId },
      data: {
        status: input.toStatus,
        resolvedAt:
          input.toStatus === "RESOLVED" || input.toStatus === "WAIVED" ? new Date() : null,
      },
    });
  }

  return client.complianceAction.create({
    data: {
      issueId: input.issueId,
      actorUserId: input.actorUserId ?? null,
      actorRoleSnapshot: input.actorRoleSnapshot ?? null,
      actionType: input.actionType,
      toStatus: input.toStatus ?? null,
      summary: input.summary,
      notes: input.notes ?? null,
      metadata: input.metadata ?? undefined,
    },
  });
}

function shouldPersistFinding(finding: RuleResult) {
  return finding.severity === "error" || NOTIFIABLE_WARNING_RULE_CODES.has(finding.ruleCode);
}

export function createComplianceIssueService(
  client: ComplianceIssueDbClient = prisma,
) {
  const dueTimeCalculator = createComplianceDueTimeCalculator(client);
  const notificationService = createComplianceNotificationService(client);

  async function syncTeamReport(input: {
    leagueId: string;
    seasonId: string;
    teamName: string;
    report: TeamComplianceReport;
    actorUserId?: string | null;
    actorRoleSnapshot?: LeagueRole | null;
  }) {
    const existingIssues = await client.complianceIssue.findMany({
      where: {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: input.report.teamId,
        source: "RULE_ENGINE",
        status: {
          in: SYNCABLE_RULE_STATUSES,
        },
      },
    });

    const byFingerprint = new Map(existingIssues.map((issue) => [issue.fingerprint, issue]));
    const activeFingerprints = new Set<string>();
    const counts = {
      created: 0,
      updated: 0,
      resolved: 0,
    };

    for (const finding of input.report.findings.filter(shouldPersistFinding)) {
      const issueType = issueTypeFromRuleCode(finding.ruleCode);
      const severity = toIssueSeverity(finding.severity);
      const fingerprint = buildRuleIssueFingerprint({
        seasonId: input.seasonId,
        teamId: input.report.teamId,
        finding,
      });
      activeFingerprints.add(fingerprint);

      const dueTime = await dueTimeCalculator.calculate({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        issueType,
        severity,
      });
      const existing = byFingerprint.get(fingerprint);

      if (!existing) {
        const created = await client.complianceIssue.create({
          data: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            teamId: input.report.teamId,
            playerId:
              typeof finding.context?.playerId === "string" ? finding.context.playerId : null,
            contractId:
              typeof finding.context?.contractId === "string" ? finding.context.contractId : null,
            createdByUserId: input.actorUserId ?? null,
            source: "RULE_ENGINE",
            issueType,
            severity,
            status: "OPEN",
            code: finding.ruleCode,
            ruleCode: finding.ruleCode,
            title: buildRuleIssueTitle({
              teamName: input.teamName,
              finding,
            }),
            message: buildRuleIssueMessage(finding),
            fingerprint,
            dueAt: dueTime.dueAt,
            dueAtBasis: dueTime.basis,
            dueAtReason: dueTime.reason,
            metadata: {
              findingContext: finding.context ?? null,
              remediation: buildDefaultRemediationMetadata({
                id: fingerprint,
                ruleCode: finding.ruleCode,
              }),
            } as Prisma.InputJsonValue,
          },
        });

        const action = await createIssueAction(client, {
          issueId: created.id,
          actorUserId: input.actorUserId,
          actorRoleSnapshot: input.actorRoleSnapshot ?? null,
          actionType: "CREATED",
          summary: `Compliance issue created for ${input.teamName}.`,
          metadata: {
            ruleCode: finding.ruleCode,
            severity: finding.severity,
          } as Prisma.InputJsonValue,
        });

        await notificationService.notifyComplianceIssue({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.report.teamId,
          issueId: created.id,
          actionId: action.id,
          actorUserId: input.actorUserId ?? null,
          eventType: "compliance.issue.created",
          title: created.title,
          body: created.message,
          dedupeKey: `${created.fingerprint}:created`,
        });

        counts.created += 1;
        continue;
      }

      await client.complianceIssue.update({
        where: { id: existing.id },
        data: {
          playerId:
            typeof finding.context?.playerId === "string" ? finding.context.playerId : null,
          contractId:
            typeof finding.context?.contractId === "string" ? finding.context.contractId : null,
          issueType,
          severity,
          code: finding.ruleCode,
          ruleCode: finding.ruleCode,
          title: buildRuleIssueTitle({
            teamName: input.teamName,
            finding,
          }),
          message: buildRuleIssueMessage(finding),
          dueAt: dueTime.dueAt,
          dueAtBasis: dueTime.basis,
          dueAtReason: dueTime.reason,
          resolvedAt: null,
          metadata: mergeIssueMetadata({
            issueId: existing.id,
            ruleCode: finding.ruleCode,
            metadata: existing.metadata,
            findingContext: finding.context ?? null,
          }),
        },
      });
      counts.updated += 1;
    }

    for (const staleIssue of existingIssues) {
      if (activeFingerprints.has(staleIssue.fingerprint)) {
        continue;
      }

      const action = await createIssueAction(client, {
        issueId: staleIssue.id,
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        actionType: "RESOLVED",
        summary: "Compliance issue resolved by latest validation run.",
        toStatus: "RESOLVED",
      });

      await notificationService.notifyComplianceIssue({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: staleIssue.teamId,
        issueId: staleIssue.id,
        actionId: action.id,
        actorUserId: input.actorUserId ?? null,
        eventType: "compliance.issue.resolved",
        title: staleIssue.title,
        body: "A previously open compliance issue no longer appears in the latest validation scan.",
        dedupeKey: `${staleIssue.fingerprint}:resolved`,
      });

      counts.resolved += 1;
    }

    return counts;
  }

  async function syncDeadlineIssues(input: {
    leagueId: string;
    seasonId: string;
    actorUserId?: string | null;
    actorRoleSnapshot?: LeagueRole | null;
    now?: Date;
  }) {
    const now = input.now ?? new Date();
    const [season, league] = await Promise.all([
      client.season.findFirst({
        where: {
          id: input.seasonId,
          leagueId: input.leagueId,
        },
        select: {
          id: true,
          phase: true,
        },
      }),
      client.league.findFirst({
        where: {
          id: input.leagueId,
        },
        select: {
          id: true,
          createdAt: true,
        },
      }),
    ]);

    if (!season || !league) {
      return { created: 0, updated: 0, resolved: 0 };
    }

    const [deadlines, existingIssues] = await Promise.all([
      client.leagueDeadline.findMany({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          phase: season.phase,
        },
        orderBy: {
          scheduledAt: "asc",
        },
      }),
      client.complianceIssue.findMany({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          source: "DEADLINE",
          status: {
            in: SYNCABLE_RULE_STATUSES,
          },
        },
      }),
    ]);

    const existingByFingerprint = new Map(existingIssues.map((issue) => [issue.fingerprint, issue]));
    const activeFingerprints = new Set<string>();
    const counts = {
      created: 0,
      updated: 0,
      resolved: 0,
    };

    for (const deadline of deadlines) {
      const diffMs = deadline.scheduledAt.getTime() - now.getTime();
      const baseOverdue = diffMs <= 0;
      
      // Skip deadlines that were scheduled before the league existed (default placeholders)
      // These represent seeded defaults, not real configured deadlines
      const deadlinePreDatesLeague = deadline.scheduledAt.getTime() < league.createdAt.getTime();
      const isConfiguredDeadline = deadline.sourceType !== "CONSTITUTION_DEFAULT" || !deadlinePreDatesLeague;
      
      // Only treat as truly overdue if:
      // 1. The deadline time has passed, AND
      // 2. Either the deadline was configured after league creation OR it's been explicitly updated from defaults
      const overdue = baseOverdue && isConfiguredDeadline;
      
      const maxReminderDays = Array.isArray(deadline.reminderOffsetsJson)
        ? deadline.reminderOffsetsJson
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => b - a)[0] ?? 1
        : 1;
      const reminderWindowMs = maxReminderDays * 24 * 60 * 60 * 1000;
      const approaching = !baseOverdue && diffMs <= reminderWindowMs && isConfiguredDeadline;

      const relevant = overdue || approaching;
      const fingerprint = buildDeadlineIssueFingerprint({
        seasonId: input.seasonId,
        deadlineId: deadline.id,
      });

      if (!relevant) {
        continue;
      }

      activeFingerprints.add(fingerprint);
      const severity: ComplianceIssueSeverity = overdue ? "ERROR" : "WARNING";
      const existing = existingByFingerprint.get(fingerprint);

      if (!existing) {
        const created = await client.complianceIssue.create({
          data: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
            leagueDeadlineId: deadline.id,
            createdByUserId: input.actorUserId ?? null,
            source: "DEADLINE",
            issueType: "DEADLINE",
            severity,
            status: "OPEN",
            code: `DEADLINE_${deadline.deadlineType}`,
            title: buildDeadlineIssueTitle({
              deadlineType: deadline.deadlineType,
              overdue,
            }),
            message: buildDeadlineIssueMessage({
              deadlineType: deadline.deadlineType,
              scheduledAt: deadline.scheduledAt,
              overdue,
              phase: deadline.phase,
            }),
            fingerprint,
            dueAt: deadline.scheduledAt,
            dueAtBasis: "DEADLINE",
            dueAtReason: `Driven by ${deadline.deadlineType} deadline.`,
            metadata: {
              deadlineType: deadline.deadlineType,
              phase: deadline.phase,
              sourceType: deadline.sourceType,
            } as Prisma.InputJsonValue,
          },
        });

        const action = await createIssueAction(client, {
          issueId: created.id,
          actorUserId: input.actorUserId,
          actorRoleSnapshot: input.actorRoleSnapshot ?? null,
          actionType: "CREATED",
          summary: overdue
            ? "Deadline issue created after deadline passed."
            : "Deadline issue created ahead of approaching deadline.",
        });

        await notificationService.notifyComplianceIssue({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          issueId: created.id,
          actionId: action.id,
          actorUserId: input.actorUserId ?? null,
          eventType: overdue ? "compliance.deadline.missed" : "compliance.deadline.approaching",
          title: created.title,
          body: created.message,
          dedupeKey: `${created.fingerprint}:${severity.toLowerCase()}`,
        });

        counts.created += 1;
        continue;
      }

      const wasSeverity = existing.severity;
      await client.complianceIssue.update({
        where: { id: existing.id },
        data: {
          severity,
          title: buildDeadlineIssueTitle({
            deadlineType: deadline.deadlineType,
            overdue,
          }),
          message: buildDeadlineIssueMessage({
            deadlineType: deadline.deadlineType,
            scheduledAt: deadline.scheduledAt,
            overdue,
            phase: deadline.phase,
          }),
          dueAt: deadline.scheduledAt,
          dueAtBasis: "DEADLINE",
          dueAtReason: `Driven by ${deadline.deadlineType} deadline.`,
          resolvedAt: null,
          metadata: {
            deadlineType: deadline.deadlineType,
            phase: deadline.phase,
            sourceType: deadline.sourceType,
          } as Prisma.InputJsonValue,
        },
      });

      if (wasSeverity !== severity && overdue) {
        await notificationService.notifyComplianceIssue({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          issueId: existing.id,
          actorUserId: input.actorUserId ?? null,
          eventType: "compliance.deadline.missed",
          title: buildDeadlineIssueTitle({
            deadlineType: deadline.deadlineType,
            overdue,
          }),
          body: buildDeadlineIssueMessage({
            deadlineType: deadline.deadlineType,
            scheduledAt: deadline.scheduledAt,
            overdue,
            phase: deadline.phase,
          }),
          dedupeKey: `${existing.fingerprint}:escalated`,
        });
      }

      counts.updated += 1;
    }

    for (const staleIssue of existingIssues) {
      if (activeFingerprints.has(staleIssue.fingerprint)) {
        continue;
      }

      await createIssueAction(client, {
        issueId: staleIssue.id,
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        actionType: "RESOLVED",
        summary: "Deadline issue cleared because the current window no longer applies.",
        toStatus: "RESOLVED",
      });
      counts.resolved += 1;
    }

    return counts;
  }

  return {
    async syncLeagueComplianceScan(input: {
      leagueId: string;
      seasonId: string;
      report?: LeagueComplianceReport;
      actorUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
    }) {
      const report =
        input.report ??
        (await evaluateLeagueCompliance({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
        }));

      const teams = await client.team.findMany({
        where: {
          leagueId: input.leagueId,
          id: {
            in: report.teams.map((team) => team.teamId),
          },
        },
        select: {
          id: true,
          name: true,
        },
      });
      const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

      const totals = {
        created: 0,
        updated: 0,
        resolved: 0,
      };

      for (const teamReport of report.teams) {
        const result = await syncTeamReport({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamName: teamNameById.get(teamReport.teamId) ?? "Team",
          report: teamReport,
          actorUserId: input.actorUserId ?? null,
          actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        });
        totals.created += result.created;
        totals.updated += result.updated;
        totals.resolved += result.resolved;
      }

      const deadlineTotals = await syncDeadlineIssues({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        actorUserId: input.actorUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
      });

      totals.created += deadlineTotals.created;
      totals.updated += deadlineTotals.updated;
      totals.resolved += deadlineTotals.resolved;

      return {
        report,
        issues: totals,
      };
    },

    syncDeadlineIssues,

    async syncTeamComplianceState(input: {
      leagueId: string;
      seasonId: string;
      teamId: string;
      actorUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
    }) {
      const [team, report] = await Promise.all([
        client.team.findFirst({
          where: {
            id: input.teamId,
            leagueId: input.leagueId,
          },
          select: {
            id: true,
            name: true,
          },
        }),
        evaluateTeamCompliance({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.teamId,
        }),
      ]);

      if (!team || !report) {
        throw new Error("TEAM_NOT_FOUND");
      }

      const totals = await syncTeamReport({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamName: team.name,
        report,
        actorUserId: input.actorUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
      });

      return {
        report,
        issues: totals,
      };
    },

    async createManualIssue(input: {
      leagueId: string;
      seasonId: string;
      teamId?: string | null;
      playerId?: string | null;
      contractId?: string | null;
      issueType: ComplianceIssueType;
      severity: ComplianceIssueSeverity;
      code?: string | null;
      title: string;
      message: string;
      explicitDueAt?: Date | string | null;
      createdByUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
      metadata?: Prisma.InputJsonValue;
    }) {
      const dueTime = await dueTimeCalculator.calculate({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        issueType: input.issueType,
        severity: input.severity,
        explicitDueAt: input.explicitDueAt ?? null,
      });

      const fingerprint = buildManualIssueFingerprint({
        seasonId: input.seasonId,
        teamId: input.teamId ?? null,
        code: input.code ?? `MANUAL_${input.issueType}`,
        title: input.title,
      });

      const created = await client.complianceIssue.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.teamId ?? null,
          playerId: input.playerId ?? null,
          contractId: input.contractId ?? null,
          createdByUserId: input.createdByUserId ?? null,
          source: "MANUAL",
          issueType: input.issueType,
          severity: input.severity,
          status: "OPEN",
          code: input.code ?? `MANUAL_${input.issueType}`,
          title: input.title.trim(),
          message: input.message.trim(),
          fingerprint,
          dueAt: dueTime.dueAt,
          dueAtBasis: dueTime.basis,
          dueAtReason: dueTime.reason,
          metadata: input.metadata ? toInputJsonValue(input.metadata) : undefined,
        },
      });

      const action = await createIssueAction(client, {
        issueId: created.id,
        actorUserId: input.createdByUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        actionType: "CREATED",
        summary: "Commissioner created compliance issue.",
        metadata: input.metadata ? toInputJsonValue(input.metadata) : undefined,
      });

      await notificationService.notifyComplianceIssue({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: input.teamId ?? null,
        issueId: created.id,
        actionId: action.id,
        actorUserId: input.createdByUserId ?? null,
        eventType: "compliance.issue.created",
        title: created.title,
        body: created.message,
        dedupeKey: `${created.fingerprint}:manual`,
      });

      return created;
    },

    async createSyncIssue(input: {
      leagueId: string;
      seasonId: string;
      teamId?: string | null;
      playerId?: string | null;
      title: string;
      message: string;
      mismatchId: string;
      mismatchType: string;
      fingerprint: string;
      createdByUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
      metadata?: Prisma.InputJsonValue;
    }) {
      const dueTime = await dueTimeCalculator.calculate({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        issueType: "SYNC",
        severity: "ERROR",
      });

      const created = await client.complianceIssue.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.teamId ?? null,
          playerId: input.playerId ?? null,
          createdByUserId: input.createdByUserId ?? null,
          source: "SYNC",
          issueType: "SYNC",
          severity: "ERROR",
          status: "OPEN",
          code: `SYNC_${input.mismatchType}`,
          title: input.title.trim(),
          message: input.message.trim(),
          fingerprint: JSON.stringify({
            source: "SYNC",
            seasonId: input.seasonId,
            mismatchId: input.mismatchId,
            fingerprint: input.fingerprint,
          }),
          dueAt: dueTime.dueAt,
          dueAtBasis: dueTime.basis,
          dueAtReason: dueTime.reason,
          metadata:
            input.metadata ??
            ({
              mismatchId: input.mismatchId,
              mismatchType: input.mismatchType,
              sourceFingerprint: input.fingerprint,
            } as Prisma.InputJsonValue),
        },
      });

      const action = await createIssueAction(client, {
        issueId: created.id,
        actorUserId: input.createdByUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        actionType: "CREATED",
        summary: "Sync mismatch escalated to compliance issue.",
        metadata:
          input.metadata ??
          ({
            mismatchId: input.mismatchId,
            mismatchType: input.mismatchType,
            sourceFingerprint: input.fingerprint,
          } as Prisma.InputJsonValue),
      });

      await notificationService.notifyComplianceIssue({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: input.teamId ?? null,
        issueId: created.id,
        actionId: action.id,
        actorUserId: input.createdByUserId ?? null,
        eventType: "compliance.issue.created",
        title: created.title,
        body: created.message,
        dedupeKey: `${created.fingerprint}:sync`,
      });

      return created;
    },

    async appendAction(input: {
      issueId: string;
      actorUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
      actionType: ComplianceActionType;
      summary: string;
      notes?: string | null;
      toStatus?: ComplianceIssueStatus;
      metadata?: Prisma.InputJsonValue;
    }) {
      const issue = await client.complianceIssue.findUnique({
        where: {
          id: input.issueId,
        },
        select: {
          id: true,
          leagueId: true,
          seasonId: true,
          teamId: true,
          title: true,
          metadata: true,
        },
      });

      if (!issue) {
        throw new Error("COMPLIANCE_ISSUE_NOT_FOUND");
      }

      const action = await createIssueAction(client, input);

      await notificationService.notifyComplianceIssue({
        leagueId: issue.leagueId,
        seasonId: issue.seasonId,
        teamId: issue.teamId,
        issueId: issue.id,
        actionId: action.id,
        actorUserId: input.actorUserId ?? null,
        eventType: "compliance.issue.action",
        title: issue.title,
        body: input.summary,
        dedupeKey: `${issue.id}:${action.id}`,
      });

      return action;
    },

    async updateRemediationState(input: {
      issueId: string;
      actorUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
      acknowledgedAt: string | null;
      steps: Array<{
        id: string;
        label: string;
        completed: boolean;
        completedAt: string | null;
      }>;
      notes?: string | null;
    }) {
      const issue = await client.complianceIssue.findUnique({
        where: {
          id: input.issueId,
        },
      });

      if (!issue) {
        throw new Error("COMPLIANCE_ISSUE_NOT_FOUND");
      }

      const nextRemediation = normalizeRemediationMetadata({
        id: issue.id,
        ruleCode: issue.ruleCode ?? issue.code,
        metadata: {
          acknowledgedAt: input.acknowledgedAt,
          steps: input.steps,
        },
      });

      await client.complianceIssue.update({
        where: {
          id: issue.id,
        },
        data: {
          status:
            nextRemediation.acknowledgedAt &&
            nextRemediation.steps.every((step) => step.completed)
              ? "IN_REVIEW"
              : "OPEN",
          metadata: {
            ...(isRecord(issue.metadata) ? issue.metadata : {}),
            remediation: nextRemediation,
          } as Prisma.InputJsonValue,
        },
      });

      const action = await createIssueAction(client, {
        issueId: issue.id,
        actorUserId: input.actorUserId ?? null,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        actionType:
          nextRemediation.acknowledgedAt &&
          nextRemediation.steps.every((step) => step.completed)
            ? "REMEDIATION_SUBMITTED"
            : "REMEDIATION_APPLIED",
        summary:
          nextRemediation.acknowledgedAt &&
          nextRemediation.steps.every((step) => step.completed)
            ? "Owner submitted remediation evidence for commissioner review."
            : "Owner updated remediation progress.",
        notes: input.notes ?? null,
        toStatus:
          nextRemediation.acknowledgedAt &&
          nextRemediation.steps.every((step) => step.completed)
            ? "IN_REVIEW"
            : "OPEN",
        metadata: {
          remediation: nextRemediation,
        } as Prisma.InputJsonValue,
      });

      await notificationService.notifyComplianceIssue({
        leagueId: issue.leagueId,
        seasonId: issue.seasonId,
        teamId: issue.teamId,
        issueId: issue.id,
        actionId: action.id,
        actorUserId: input.actorUserId ?? null,
        eventType:
          nextRemediation.acknowledgedAt &&
          nextRemediation.steps.every((step) => step.completed)
            ? "compliance.issue.remediation_submitted"
            : "compliance.issue.remediation_progress",
        title: issue.title,
        body:
          nextRemediation.acknowledgedAt &&
          nextRemediation.steps.every((step) => step.completed)
            ? "Owner submitted remediation evidence for review."
            : "Owner updated remediation progress.",
        dedupeKey: `${issue.id}:${action.id}`,
      });

      return action;
    },
  };
}
