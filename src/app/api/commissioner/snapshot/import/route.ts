import { TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import {
  buildSnapshotPreviewReceipt,
  buildSnapshotRestoreImpactSummary,
  getSnapshotRestoreBaselineCounts,
  summarizeSnapshotCounts,
  validateSnapshotPayload,
} from "@/lib/snapshot";
import { auditActorFromRequestActor, logTransaction } from "@/lib/transactions";
import { PILOT_EVENT_TYPES } from "@/types/pilot";
import { SnapshotImportRequest, isSnapshotImportMode } from "@/types/snapshot";

export async function POST(request: NextRequest) {
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };

  const body = (await request.json().catch(() => ({}))) as SnapshotImportRequest;
  const mode = body.mode ?? "preview";
  const replaceExisting = body.replaceExisting === true;
  const previewHash =
    typeof body.previewHash === "string" && body.previewHash.trim().length > 0
      ? body.previewHash.trim().toLowerCase()
      : null;

  if (!isSnapshotImportMode(mode)) {
    return apiError(400, "INVALID_IMPORT_MODE", "mode must be preview or apply.");
  }

  const parsed = validateSnapshotPayload(body.snapshot);
  if (!parsed.valid || !parsed.snapshot) {
    return apiError(400, "INVALID_SNAPSHOT", "Snapshot payload failed validation.", {
      findings: parsed.findings,
    });
  }

  const snapshot = parsed.snapshot;
  const preview = buildSnapshotPreviewReceipt(snapshot);
  const counts = summarizeSnapshotCounts(snapshot.data);
  const currentCounts = await getSnapshotRestoreBaselineCounts();
  const impact = buildSnapshotRestoreImpactSummary({
    activeContext: context,
    snapshot,
    currentCounts,
    incomingCounts: counts,
  });

  if (mode === "preview") {
    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.COMMISSIONER_SNAPSHOT_PREVIEW,
      eventCategory: "commissioner",
      eventStep: "snapshot_preview",
      status: "success",
      entityType: "league",
      entityId: context.leagueId,
      ...requestTelemetry(request),
      context: {
        snapshotHash: preview.snapshotHash,
        findings: parsed.findings.length,
        replaceExisting,
      },
    });

    return NextResponse.json({
      mode,
      replaceExisting,
      findings: parsed.findings,
      counts,
      preview,
      impact,
    });
  }

  if (!replaceExisting) {
    return apiError(
      400,
      "REPLACE_EXISTING_REQUIRED",
      "apply mode requires replaceExisting=true for destructive restore.",
    );
  }

  if (snapshot.source.leagueId !== context.leagueId) {
    return apiError(
      409,
      "SNAPSHOT_SOURCE_LEAGUE_MISMATCH",
      "Snapshot source league does not match the active league context.",
      {
        snapshotLeagueId: snapshot.source.leagueId,
        activeLeagueId: context.leagueId,
      },
    );
  }

  if (!previewHash) {
    return apiError(
      400,
      "SNAPSHOT_PREVIEW_REQUIRED",
      "Run preview for this exact snapshot before apply.",
      {
        expectedPreviewHash: preview.snapshotHash,
      },
    );
  }

  if (previewHash !== preview.snapshotHash) {
    return apiError(
      409,
      "SNAPSHOT_PREVIEW_MISMATCH",
      "Snapshot changed since preview. Run preview again before apply.",
      {
        expectedPreviewHash: preview.snapshotHash,
        receivedPreviewHash: previewHash,
      },
    );
  }

  const seasonIds = new Set(
    snapshot.data.seasons
      .map((season) => (typeof season.id === "string" ? season.id : null))
      .filter((value): value is string => Boolean(value)),
  );
  const auditSeasonId = seasonIds.has(snapshot.source.seasonId)
    ? snapshot.source.seasonId
    : Array.from(seasonIds)[0] ?? null;

  if (!auditSeasonId) {
    return apiError(
      400,
      "SNAPSHOT_SEASON_MISSING",
      "Snapshot must include at least one season for restore apply.",
    );
  }

  await prisma.$transaction(async (tx) => {
    // Reverse dependency deletion order
    await tx.tradeAsset.deleteMany();
    await tx.draftSelection.deleteMany();
    await tx.transaction.deleteMany();
    await tx.capPenalty.deleteMany();
    await tx.contract.deleteMany();
    await tx.rosterSlot.deleteMany();
    await tx.trade.deleteMany();
    await tx.draft.deleteMany();
    await tx.futurePick.deleteMany();
    await tx.team.deleteMany();
    await tx.season.deleteMany();
    await tx.leagueRuleSet.deleteMany();
    await tx.league.deleteMany();
    await tx.owner.deleteMany();
    await tx.player.deleteMany();

    if (snapshot.data.players.length > 0) {
      await tx.player.createMany({
        data: snapshot.data.players as never[],
      });
    }
    if (snapshot.data.owners.length > 0) {
      await tx.owner.createMany({
        data: snapshot.data.owners as never[],
      });
    }
    if (snapshot.data.leagues.length > 0) {
      await tx.league.createMany({
        data: snapshot.data.leagues as never[],
      });
    }
    if (snapshot.data.seasons.length > 0) {
      await tx.season.createMany({
        data: snapshot.data.seasons as never[],
      });
    }
    if (snapshot.data.rulesets.length > 0) {
      await tx.leagueRuleSet.createMany({
        data: snapshot.data.rulesets as never[],
      });
    }
    if (snapshot.data.teams.length > 0) {
      await tx.team.createMany({
        data: snapshot.data.teams as never[],
      });
    }
    if (snapshot.data.futurePicks.length > 0) {
      await tx.futurePick.createMany({
        data: snapshot.data.futurePicks as never[],
      });
    }
    if (snapshot.data.rosterSlots.length > 0) {
      await tx.rosterSlot.createMany({
        data: snapshot.data.rosterSlots as never[],
      });
    }
    if (snapshot.data.contracts.length > 0) {
      await tx.contract.createMany({
        data: snapshot.data.contracts as never[],
      });
    }
    if (snapshot.data.capPenalties.length > 0) {
      await tx.capPenalty.createMany({
        data: snapshot.data.capPenalties as never[],
      });
    }
    if (snapshot.data.drafts.length > 0) {
      await tx.draft.createMany({
        data: snapshot.data.drafts as never[],
      });
    }
    if (snapshot.data.draftSelections.length > 0) {
      await tx.draftSelection.createMany({
        data: snapshot.data.draftSelections as never[],
      });
    }
    if (snapshot.data.trades.length > 0) {
      await tx.trade.createMany({
        data: snapshot.data.trades as never[],
      });
    }
    if (snapshot.data.tradeAssets.length > 0) {
      await tx.tradeAsset.createMany({
        data: snapshot.data.tradeAssets as never[],
      });
    }
    if (snapshot.data.transactions.length > 0) {
      await tx.transaction.createMany({
        data: snapshot.data.transactions as never[],
      });
    }

    await logTransaction(tx, {
      leagueId: snapshot.source.leagueId,
      seasonId: auditSeasonId,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: "Applied snapshot restore.",
      audit: {
        actor: auditActorFromRequestActor(auth.actor ?? null),
        source: "api/commissioner/snapshot/import POST",
        entities: {
          operation: "snapshot_restore_apply",
          snapshotVersion: snapshot.version,
          snapshotHash: preview.snapshotHash,
          snapshotLeagueId: snapshot.source.leagueId,
          snapshotSeasonId: snapshot.source.seasonId,
          snapshotSeasonYear: snapshot.source.seasonYear,
        },
        before: {
          counts: currentCounts,
        },
        after: {
          counts,
        },
      },
      metadata: {
        mode,
        replaceExisting,
        snapshotVersion: snapshot.version,
        sourceSeasonYear: snapshot.source.seasonYear,
        counts,
        impactTotals: impact.totals,
        previewHash,
        appliedAt: new Date().toISOString(),
        updatedBy: "api/commissioner/snapshot/import POST",
      },
    });
  });

  await recordPilotEventSafe(prisma, {
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    actor: auth.actor,
    eventType: PILOT_EVENT_TYPES.COMMISSIONER_SNAPSHOT_APPLY,
    eventCategory: "commissioner",
    eventStep: "snapshot_apply",
    status: "success",
    entityType: "league",
    entityId: context.leagueId,
    ...requestTelemetry(request),
    context: {
      snapshotHash: preview.snapshotHash,
      replaceExisting,
      findings: parsed.findings.length,
      recordsInserted: impact.totals.recordsToInsert,
      recordsDeleted: impact.totals.recordsToDelete,
    },
  });

  return NextResponse.json({
    mode,
    replaceExisting,
    findings: parsed.findings,
    counts,
    preview,
    impact,
    applied: true,
  });
}
