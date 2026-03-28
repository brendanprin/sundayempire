import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getActiveLeagueContext } from "@/lib/league-context";
import { requireLeagueRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSyncRunService } from "@/lib/domain/sync/sync-run-service";

export async function POST(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  try {
    const result = await createSyncRunService(prisma).run({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      requestedByUserId: auth.actor?.userId ?? null,
      actor: auth.actor
        ? {
            email: auth.actor.email,
            leagueRole: auth.actor.leagueRole,
            teamId: auth.actor.teamId,
          }
        : null,
      body,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync run failed.";
    if (message === "INVALID_SYNC_ADAPTER") {
      return apiError(400, "INVALID_SYNC_ADAPTER", "adapterKey must identify a supported sync adapter.");
    }
    if (message === "SYNC_IMPORT_REQUIRED") {
      return apiError(400, "SYNC_IMPORT_REQUIRED", "At least one roster or transaction import payload is required.");
    }
    return apiError(400, "SYNC_RUN_FAILED", message);
  }
}
