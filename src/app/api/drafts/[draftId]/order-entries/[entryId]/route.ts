import { DraftOrderSourceType, Prisma, TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { createCommissionerOverrideService } from "@/lib/domain/compliance/commissioner-override-service";
import { createRookieDraftOrderService } from "@/lib/domain/draft/rookie-draft-order-service";
import { prisma } from "@/lib/prisma";
import { createDraftSetupProjection } from "@/lib/read-models/draft/draft-setup-projection";
import { logRuntime, resolveRequestId } from "@/lib/runtime-log";
import { parseJsonBody } from "@/lib/request";
import { logTransaction } from "@/lib/transactions";
import { DraftOrderEntryCorrectionRequest, DraftOrderEntryCorrectionResponse } from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
    entryId: string;
  }>;
};

function parseRequiredString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseSourceType(value: unknown): DraftOrderSourceType | null {
  if (value === "FUTURE_PICK" || value === "MANUAL" || value === "BONUS") {
    return value;
  }

  return null;
}

function normalizeSnapshot(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const { draftId, entryId } = await routeContext.params;
  const access = await requireDraftLeagueRole(request, draftId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const actor = access.actor;

  const json = await parseJsonBody<DraftOrderEntryCorrectionRequest>(request);
  if (!json.ok) return json.response;
  const body = json.data;
  const selectingTeamId = parseRequiredString(body.selectingTeamId);
  const owningTeamId = parseRequiredString(body.owningTeamId) ?? selectingTeamId;
  const reason = parseRequiredString(body.reason);
  const futurePickId = parseOptionalString(body.futurePickId);
  const originalTeamId = parseOptionalString(body.originalTeamId);
  const sourceType = parseSourceType(body.sourceType);

  if (!selectingTeamId) {
    return apiError(400, "INVALID_REQUEST", "selectingTeamId is required.");
  }
  if (!owningTeamId) {
    return apiError(400, "INVALID_REQUEST", "owningTeamId is required.");
  }
  if (!reason) {
    return apiError(400, "INVALID_REQUEST", "reason is required for draft order corrections.");
  }

  const [selectingTeam, owningTeam, futurePick] = await Promise.all([
    prisma.team.findFirst({
      where: {
        id: selectingTeamId,
        leagueId: context.leagueId,
      },
      select: {
        id: true,
      },
    }),
    prisma.team.findFirst({
      where: {
        id: owningTeamId,
        leagueId: context.leagueId,
      },
      select: {
        id: true,
      },
    }),
    futurePickId
      ? prisma.futurePick.findFirst({
          where: {
            id: futurePickId,
            leagueId: context.leagueId,
          },
          select: {
            id: true,
          },
        })
      : Promise.resolve(null),
  ]);

  if (!selectingTeam || !owningTeam) {
    return apiError(404, "TEAM_NOT_FOUND", "Draft order correction team was not found in the active league.");
  }
  if (futurePickId && !futurePick) {
    return apiError(404, "PICK_NOT_FOUND", "Future pick was not found in the active league.");
  }

  const requestId = resolveRequestId(request);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const before = await tx.draftOrderEntry.findFirst({
          where: {
            id: entryId,
            draftId,
          },
          include: {
            futurePick: {
              select: {
                id: true,
                seasonYear: true,
                round: true,
                overall: true,
              },
            },
            originalTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            owningTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            selectingTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
          },
        });

        if (!before) {
          throw new Error("DRAFT_PICK_INVALID");
        }

        const updatedEntry = await createRookieDraftOrderService(tx).updateOrderEntry({
          draftId,
          entryId,
          selectingTeamId,
          owningTeamId,
          futurePickId,
          originalTeamId,
          sourceType: sourceType ?? "MANUAL",
          reason,
          createdByUserId: actor.userId,
        });

        await logTransaction(tx, {
          leagueId: context.leagueId,
          seasonId: context.seasonId,
          teamId: selectingTeamId,
          type: TransactionType.COMMISSIONER_OVERRIDE,
          summary: `Corrected rookie draft order slot ${before.pickNumber}.`,
          metadata: {
            draftId,
            entryId,
            reason,
            updatedBy: "api/drafts/[draftId]/order-entries/[entryId] PATCH",
          },
        });

        const override = await createCommissionerOverrideService(tx).recordOverride({
          leagueId: context.leagueId,
          seasonId: context.seasonId,
          teamId: selectingTeamId,
          actorUserId: actor.userId,
          actorRoleSnapshot: actor.leagueRole,
          overrideType: "MANUAL_RULING",
          reason,
          entityType: "draft_order_entry",
          entityId: entryId,
          beforeJson: normalizeSnapshot({
            id: before.id,
            pickNumber: before.pickNumber,
            round: before.round,
            sourceType: before.sourceType,
            futurePick: before.futurePick,
            originalTeam: before.originalTeam,
            owningTeam: before.owningTeam,
            selectingTeam: before.selectingTeam,
          }),
          afterJson: normalizeSnapshot({
            id: updatedEntry.id,
            pickNumber: updatedEntry.pickNumber,
            round: updatedEntry.round,
            sourceType: updatedEntry.sourceType,
            futurePick: updatedEntry.futurePick,
            originalTeam: updatedEntry.originalTeam,
            owningTeam: updatedEntry.owningTeam,
            selectingTeam: updatedEntry.selectingTeam,
          }),
          metadata: normalizeSnapshot({
            draftId,
            path: "api/drafts/[draftId]/order-entries/[entryId] PATCH",
          }),
          notify: false,
        });

        return {
          overrideId: override.id,
        };
      },
      { timeout: 15_000 },
    );

    try {
      await createCommissionerOverrideService(prisma).notifyRecordedOverride({
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        teamId: selectingTeamId,
        overrideId: result.overrideId,
        actorUserId: actor.userId,
        title: "Rookie draft order corrected",
        body: reason,
        dedupeKey: `draft-order-correction:${entryId}:${result.overrideId}`,
      });
    } catch (error) {
      logRuntime("warn", {
        event: "draft.order_correction.notification_failed",
        requestId,
        actorEmail: actor.email,
        actorRole: actor.leagueRole,
        path: request.nextUrl.pathname,
        method: request.method,
        draftId,
        entryId,
        error: error instanceof Error ? error.message : "unknown",
      });
    }

    const projection = await createDraftSetupProjection(prisma).read({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      draftId,
      actorRole: actor.leagueRole,
    });

    if (!projection) {
      return apiError(404, "DRAFT_SETUP_NOT_FOUND", "Rookie draft setup context could not be resolved.");
    }

    const response: DraftOrderEntryCorrectionResponse = {
      setup: projection,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "DRAFT_ORDER_CORRECTION_FAILED";
    if (message === "DRAFT_PICK_INVALID") {
      return apiError(404, "DRAFT_PICK_INVALID", "Draft order entry was not found for this rookie draft.");
    }
    if (message === "DRAFT_STATE_CONFLICT") {
      return apiError(409, "DRAFT_STATE_CONFLICT", "Draft order can only be corrected before the rookie draft starts.");
    }
    if (message === "DRAFT_NOT_FOUND") {
      return apiError(404, "DRAFT_NOT_FOUND", "Rookie draft was not found.");
    }

    return apiError(409, "DRAFT_ORDER_CORRECTION_FAILED", "Draft order correction could not be applied.");
  }
}
