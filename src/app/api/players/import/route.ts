import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import type { PlayerImportRequest } from "@/lib/player-import";
import { prisma } from "@/lib/prisma";
import { parseJsonBody } from "@/lib/request";
import { createCommissionerPlayerRefreshService } from "@/lib/domain/player/player-refresh-review-service";

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const json = await parseJsonBody<PlayerImportRequest>(request);
  if (!json.ok) return json.response;
  const body = json.data;

  try {
    const result = await createCommissionerPlayerRefreshService(prisma).triggerRefresh({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      adapterKey: "csv-manual",
      sourceLabel: "Runtime player import",
      requestedByUserId: auth.actor?.userId ?? null,
      payload: body,
      actor: auth.actor
        ? {
            email: auth.actor.email,
            leagueRole: auth.actor.leagueRole,
            teamId: auth.actor.teamId,
          }
        : null,
    });

    const compatibilityErrors = [
      ...result.summary.errors,
      ...(result.summary.invalid > 0
        ? [`${result.summary.invalid} row(s) were classified as INVALID.`]
        : []),
      ...(result.summary.ambiguous > 0
        ? [`${result.summary.ambiguous} row(s) require commissioner review.`]
        : []),
      ...(result.summary.duplicateSuspect > 0
        ? [`${result.summary.duplicateSuspect} row(s) were flagged as duplicate suspects.`]
        : []),
    ];

    return NextResponse.json(
      {
        job: result.job,
        summary: result.summary,
        format: body.format === "csv" ? "csv" : "json",
        totals: {
          submitted: result.summary.totalSubmitted,
          normalized: result.summary.totalNormalized,
          created: result.summary.new,
          updated: result.summary.updated,
          skipped:
            result.summary.invalid +
            result.summary.ambiguous +
            result.summary.duplicateSuspect,
          errors: compatibilityErrors.length,
        },
        errors: compatibilityErrors.slice(0, 100),
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "INVALID_PLAYER_DIRECTORY_ADAPTER") {
      return apiError(400, "INVALID_PLAYER_DIRECTORY_ADAPTER", "csv-manual adapter is unavailable.");
    }
    return apiError(400, "PLAYER_IMPORT_FAILED", message);
  }
}
