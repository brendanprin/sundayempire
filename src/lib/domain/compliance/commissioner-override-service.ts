import { LeagueRole, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createComplianceNotificationService } from "@/lib/domain/compliance/compliance-notification-service";

type CommissionerOverrideDbClient = PrismaClient | Prisma.TransactionClient;

export function createCommissionerOverrideService(
  client: CommissionerOverrideDbClient = prisma,
) {
  const notificationService = createComplianceNotificationService(client);

  return {
    async recordOverride(input: {
      leagueId: string;
      seasonId: string;
      teamId?: string | null;
      issueId?: string | null;
      complianceActionId?: string | null;
      actorUserId?: string | null;
      actorRoleSnapshot?: LeagueRole | null;
      overrideType:
        | "PHASE_TRANSITION"
        | "EMERGENCY_FIX"
        | "CONTRACT_CREATE"
        | "CONTRACT_UPDATE"
        | "ISSUE_WAIVER"
        | "MANUAL_RULING";
      reason: string;
      entityType: string;
      entityId: string;
      beforeJson?: Prisma.InputJsonValue;
      afterJson?: Prisma.InputJsonValue;
      metadata?: Prisma.InputJsonValue;
      notificationTitle?: string;
      notificationBody?: string;
      notify?: boolean;
    }) {
      const override = await client.commissionerOverride.create({
        data: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.teamId ?? null,
          issueId: input.issueId ?? null,
          complianceActionId: input.complianceActionId ?? null,
          actorUserId: input.actorUserId ?? null,
          actorRoleSnapshot: input.actorRoleSnapshot ?? null,
          overrideType: input.overrideType,
          reason: input.reason.trim(),
          entityType: input.entityType,
          entityId: input.entityId,
          beforeJson: input.beforeJson ?? undefined,
          afterJson: input.afterJson ?? undefined,
          metadata: input.metadata ?? undefined,
        },
      });

      if (input.notify === false) {
        return override;
      }

      await notificationService.notifyOverride({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: input.teamId ?? null,
        overrideId: override.id,
        issueId: input.issueId ?? null,
        actionId: input.complianceActionId ?? null,
        actorUserId: input.actorUserId ?? null,
        title: input.notificationTitle ?? "Commissioner override recorded",
        body: input.notificationBody ?? input.reason.trim(),
        dedupeKey: `${input.overrideType}:${input.entityType}:${input.entityId}:${override.id}`,
      });

      return override;
    },

    async notifyRecordedOverride(input: {
      leagueId: string;
      seasonId: string;
      teamId?: string | null;
      overrideId: string;
      issueId?: string | null;
      complianceActionId?: string | null;
      actorUserId?: string | null;
      title: string;
      body: string;
      dedupeKey: string;
    }) {
      await notificationService.notifyOverride({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: input.teamId ?? null,
        overrideId: input.overrideId,
        issueId: input.issueId ?? null,
        actionId: input.complianceActionId ?? null,
        actorUserId: input.actorUserId ?? null,
        title: input.title,
        body: input.body,
        dedupeKey: input.dedupeKey,
      });
    },
  };
}
