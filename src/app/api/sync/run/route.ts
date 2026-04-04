import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { prisma } from "@/lib/prisma";
import { createSyncRunService } from "@/lib/domain/sync/sync-run-service";
import { parseJsonBody } from "@/lib/request";

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { actor, context } = access;

  const json = await parseJsonBody<Record<string, unknown>>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  try {
    const result = await createSyncRunService(prisma).run({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      requestedByUserId: actor?.userId ?? null,
      actor: actor
        ? {
            email: actor.email,
            leagueRole: actor.leagueRole,
            teamId: actor.teamId,
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
