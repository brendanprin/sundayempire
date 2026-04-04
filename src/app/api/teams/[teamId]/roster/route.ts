import { TeamSlotType, TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireCurrentLeagueRole, requireTeamLeagueRole } from "@/lib/authorization";
import { requireActorTeamScope } from "@/lib/auth";
import { getIntroducedErrorFindings } from "@/lib/compliance/diff";
import { loadTeamValidationContext } from "@/lib/compliance/context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { createDeadCapChargeService } from "@/lib/domain/contracts/dead-cap-charge-service";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { createLifecycleService } from "@/lib/domain/lifecycle/service";
import { createRosterAssignmentService } from "@/lib/domain/roster-assignment/service";
import { evaluateRosterWritePolicy } from "@/lib/domain/roster/roster-write-policy";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";
import { recordPilotEventSafe, requestTelemetry } from "@/lib/pilot-events";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";
import { PILOT_EVENT_TYPES } from "@/types/pilot";

type RouteContext = {
  params: Promise<{
    teamId: string;
  }>;
};

type RosterMutationAction =
  | "move"
  | "add"
  | "drop"
  | "swap"
  | "cut"
  | "move_to_starter"
  | "move_to_bench"
  | "move_to_ir";

function parseSlotType(raw: unknown): TeamSlotType | null {
  if (typeof raw !== "string") {
    return null;
  }

  if (raw === "STARTER" || raw === "BENCH" || raw === "IR" || raw === "TAXI") {
    return raw;
  }

  return null;
}

function buildDefaultSlotLabel(slotType: TeamSlotType, existingCount: number) {
  return `${slotType}${existingCount + 1}`;
}

function buildNextAvailableSlotLabel(
  slotType: TeamSlotType,
  existingSlots: { id: string; slotType: TeamSlotType; slotLabel: string | null }[],
  excludeRosterSlotId?: string,
) {
  const usedLabels = new Set(
    existingSlots
      .filter((slot) => slot.slotType === slotType && slot.id !== excludeRosterSlotId)
      .map((slot) => slot.slotLabel)
      .filter((slotLabel): slotLabel is string => Boolean(slotLabel)),
  );

  let index = 1;
  while (usedLabels.has(`${slotType}${index}`)) {
    index += 1;
  }

  return `${slotType}${index}`;
}

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const { teamId } = await routeContext.params;
  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER", "MEMBER"]);
  if (access.response) return access.response;
  const { context } = access;

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      leagueId: context.leagueId,
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  });

  if (!team) {
    return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.", {
      teamId,
    });
  }

  const [rosterSlots, contracts, penalties, picks, transactions] = await Promise.all([
    prisma.rosterSlot.findMany({
      where: {
        teamId: team.id,
        seasonId: context.seasonId,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            nflTeam: true,
            age: true,
            injuryStatus: true,
          },
        },
      },
      orderBy: [{ slotType: "asc" }, { slotLabel: "asc" }],
    }),
    prisma.contract.findMany({
      where: {
        teamId: team.id,
        seasonId: context.seasonId,
        status: {
          in: [...ACTIVE_CONTRACT_STATUSES],
        },
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            nflTeam: true,
          },
        },
      },
      orderBy: [{ yearsRemaining: "asc" }, { salary: "desc" }],
    }),
    prisma.capPenalty.findMany({
      where: {
        teamId: team.id,
        seasonId: context.seasonId,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
      },
      orderBy: { amount: "desc" },
    }),
    prisma.futurePick.findMany({
      where: {
        leagueId: context.leagueId,
        currentTeamId: team.id,
        seasonYear: {
          gte: context.seasonYear,
          lte: context.seasonYear + 2,
        },
      },
      include: {
        originalTeam: {
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        },
      },
      orderBy: [{ seasonYear: "asc" }, { round: "asc" }, { overall: "asc" }],
    }),
    prisma.transaction.findMany({
      where: {
        seasonId: context.seasonId,
        teamId: team.id,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    team,
    rosterSlots,
    contracts,
    penalties,
    picks,
    transactions,
  });
}

export async function PATCH(request: NextRequest, routeContext: RouteContext) {
  const { teamId } = await routeContext.params;
  const access = await requireTeamLeagueRole(request, teamId, ["COMMISSIONER", "MEMBER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const auth = { actor: access.actor };
  const requestMeta = requestTelemetry(request);
  if (auth.actor.leagueRole === "MEMBER") {
    const scopeError = requireActorTeamScope(auth.actor, teamId);
    if (scopeError) {
      await recordPilotEventSafe(prisma, {
        leagueId: context.leagueId,
        seasonId: context.seasonId,
        actor: auth.actor,
        eventType: PILOT_EVENT_TYPES.UI_TEAM_BLOCKED_MUTATION,
        eventCategory: "ui",
        eventStep: "mutation_attempt",
        status: "blocked",
        entityType: "team",
        entityId: teamId,
        pagePath: `/teams/${teamId}`,
        ...requestMeta,
        context: {
          reason: "member_team_scope_mismatch",
          actorTeamId: auth.actor.teamId,
          targetTeamId: teamId,
        },
      });
      return scopeError;
    }
  }

  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      leagueId: context.leagueId,
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  });

  if (!team) {
    return apiError(404, "TEAM_NOT_FOUND", "Team was not found in the active league.", {
      teamId,
    });
  }

  const body = (await request.json()) as {
    action?: RosterMutationAction;
    rosterSlotId?: string;
    sourceRosterSlotId?: string;
    targetRosterSlotId?: string;
    playerId?: string;
    targetSlotType?: TeamSlotType;
    targetSlotLabel?: string;
    slotType?: TeamSlotType;
    slotLabel?: string;
  };

  if (!body.action) {
    return apiError(400, "INVALID_REQUEST", "action is required.");
  }

  const lifecycle = await createLifecycleService().readLeagueLifecycle(context.leagueId);
  if (!lifecycle.ok) {
    return apiError(
      lifecycle.error.status,
      lifecycle.error.code,
      lifecycle.error.message,
      lifecycle.error.context,
    );
  }

  const writePolicy = evaluateRosterWritePolicy({
    phase: lifecycle.data.currentPhase,
    actorRole: auth.actor.leagueRole,
    action: body.action,
  });
  if (!writePolicy.ok) {
    return apiError(
      writePolicy.error.status,
      writePolicy.error.code,
      writePolicy.error.message,
      writePolicy.error.context,
    );
  }

  const validationContext = await loadTeamValidationContext({
    leagueId: context.leagueId,
    seasonId: context.seasonId,
    teamId: team.id,
  });

  if (!validationContext) {
    return apiError(404, "TEAM_VALIDATION_CONTEXT_NOT_FOUND", "Team validation context was not found.");
  }

  const beforeReport = evaluateComplianceFromContext(validationContext);

  if (body.action === "swap") {
    if (!body.sourceRosterSlotId || !body.targetRosterSlotId) {
      return apiError(
        400,
        "INVALID_REQUEST",
        "sourceRosterSlotId and targetRosterSlotId are required for swap.",
      );
    }

    if (body.sourceRosterSlotId === body.targetRosterSlotId) {
      return apiError(
        400,
        "INVALID_REQUEST",
        "sourceRosterSlotId and targetRosterSlotId must be different.",
      );
    }

    const [sourceSlot, targetSlot] = await Promise.all([
      prisma.rosterSlot.findFirst({
        where: {
          id: body.sourceRosterSlotId,
          teamId: team.id,
          seasonId: context.seasonId,
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              injuryStatus: true,
            },
          },
        },
      }),
      prisma.rosterSlot.findFirst({
        where: {
          id: body.targetRosterSlotId,
          teamId: team.id,
          seasonId: context.seasonId,
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              injuryStatus: true,
            },
          },
        },
      }),
    ]);

    if (!sourceSlot || !targetSlot) {
      return apiError(
        404,
        "ROSTER_SLOT_NOT_FOUND",
        "Both source and target roster slots must exist for swap.",
      );
    }

    const afterContext = {
      ...validationContext,
      rosterSlots: validationContext.rosterSlots.map((slot) => {
        if (slot.id === sourceSlot.id) {
          return {
            ...slot,
            slotType: targetSlot.slotType,
            slotLabel: targetSlot.slotLabel,
          };
        }
        if (slot.id === targetSlot.id) {
          return {
            ...slot,
            slotType: sourceSlot.slotType,
            slotLabel: sourceSlot.slotLabel,
          };
        }
        return slot;
      }),
    };
    const afterReport = evaluateComplianceFromContext(afterContext);
    const introducedFindings = getIntroducedErrorFindings(beforeReport, afterReport);

    if (introducedFindings.length > 0) {
      return apiError(
        409,
        "COMPLIANCE_VIOLATION",
        "Roster swap would introduce new compliance errors.",
        {
          beforeStatus: beforeReport.status,
          afterStatus: afterReport.status,
          introducedFindings,
        },
      );
    }

    const { updatedSource, updatedTarget } = await prisma.$transaction(async (tx) => {
      const rosterAssignmentService = createRosterAssignmentService(tx);
      const teamSeasonStateService = createTeamSeasonStateRecalculationService(tx);

      const nextSource = await tx.rosterSlot.update({
        where: { id: sourceSlot.id },
        data: {
          slotType: targetSlot.slotType,
          slotLabel: targetSlot.slotLabel,
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              nflTeam: true,
              injuryStatus: true,
            },
          },
        },
      });
      const nextTarget = await tx.rosterSlot.update({
        where: { id: targetSlot.id },
        data: {
          slotType: sourceSlot.slotType,
          slotLabel: sourceSlot.slotLabel,
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              nflTeam: true,
              injuryStatus: true,
            },
          },
        },
      });

      await rosterAssignmentService.ensureAssignmentForRosterSlot({
        teamId: team.id,
        seasonId: context.seasonId,
        playerId: sourceSlot.player.id,
        slotType: nextSource.slotType,
      });
      await rosterAssignmentService.ensureAssignmentForRosterSlot({
        teamId: team.id,
        seasonId: context.seasonId,
        playerId: targetSlot.player.id,
        slotType: nextTarget.slotType,
      });
      await teamSeasonStateService.recalculateTeamSeasonState({
        teamId: team.id,
        seasonId: context.seasonId,
      });

      return {
        updatedSource: nextSource,
        updatedTarget: nextTarget,
      };
    });

    await logTransaction(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: team.id,
      type: TransactionType.ROSTER_MOVE,
      summary: `Swapped ${sourceSlot.player.name} and ${targetSlot.player.name} between ${sourceSlot.slotType} and ${targetSlot.slotType}.`,
      metadata: {
        source: {
          rosterSlotId: sourceSlot.id,
          playerId: sourceSlot.player.id,
          before: {
            slotType: sourceSlot.slotType,
            slotLabel: sourceSlot.slotLabel,
          },
          after: {
            slotType: updatedSource.slotType,
            slotLabel: updatedSource.slotLabel,
          },
        },
        target: {
          rosterSlotId: targetSlot.id,
          playerId: targetSlot.player.id,
          before: {
            slotType: targetSlot.slotType,
            slotLabel: targetSlot.slotLabel,
          },
          after: {
            slotType: updatedTarget.slotType,
            slotLabel: updatedTarget.slotLabel,
          },
        },
      },
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.ROSTER_SWAP_COMPLETED,
      eventCategory: "roster",
      eventStep: "swap",
      status: "success",
      entityType: "team",
      entityId: team.id,
      ...requestMeta,
      context: {
        action: "swap",
        sourceRosterSlotId: sourceSlot.id,
        targetRosterSlotId: targetSlot.id,
      },
    });

    return NextResponse.json({
      operation: "swap",
      rosterSlots: [updatedSource, updatedTarget],
    });
  }

  if (
    body.action === "move" ||
    body.action === "move_to_starter" ||
    body.action === "move_to_bench" ||
    body.action === "move_to_ir"
  ) {
    if (!body.rosterSlotId) {
      return apiError(400, "INVALID_REQUEST", "rosterSlotId is required for move.");
    }

    const targetSlotType =
      body.action === "move_to_starter"
        ? "STARTER"
        : body.action === "move_to_bench"
          ? "BENCH"
          : body.action === "move_to_ir"
            ? "IR"
            : parseSlotType(body.targetSlotType);
    if (!targetSlotType) {
      return apiError(400, "INVALID_REQUEST", "targetSlotType is required for move.");
    }

    const existingSlot = await prisma.rosterSlot.findFirst({
      where: {
        id: body.rosterSlotId,
        teamId: team.id,
        seasonId: context.seasonId,
      },
      include: {
        player: {
          select: {
            id: true,
            name: true,
            position: true,
            injuryStatus: true,
          },
        },
      },
    });

    if (!existingSlot) {
      return apiError(404, "ROSTER_SLOT_NOT_FOUND", "Roster slot was not found for this team.");
    }

    const existingCountOfTargetType = validationContext.rosterSlots.filter(
      (slot) => slot.slotType === targetSlotType,
    ).length;
    const generatedSlotLabel = buildNextAvailableSlotLabel(
      targetSlotType,
      validationContext.rosterSlots,
      existingSlot.id,
    );
    const targetSlotLabel =
      body.targetSlotLabel?.trim() ||
      (targetSlotType === "STARTER" ? existingSlot.slotLabel : null) ||
      (existingCountOfTargetType > 0
        ? generatedSlotLabel
        : buildDefaultSlotLabel(targetSlotType, existingCountOfTargetType));

    if (targetSlotType === "STARTER" && !targetSlotLabel) {
      return apiError(400, "INVALID_REQUEST", "targetSlotLabel is required for STARTER moves.");
    }

    if (targetSlotLabel) {
      const conflictingSlot = validationContext.rosterSlots.find(
        (slot) =>
          slot.id !== existingSlot.id &&
          slot.slotType === targetSlotType &&
          slot.slotLabel === targetSlotLabel,
      );
      if (conflictingSlot) {
        return apiError(
          409,
          "ROSTER_SLOT_CONFLICT",
          `Target slot ${targetSlotType} (${targetSlotLabel}) is already occupied.`,
          {
            targetSlotType,
            targetSlotLabel,
            conflictingRosterSlotId: conflictingSlot.id,
            conflictingPlayerId: conflictingSlot.player.id,
          },
        );
      }
    }

    const afterContext = {
      ...validationContext,
      rosterSlots: validationContext.rosterSlots.map((slot) =>
        slot.id === existingSlot.id
          ? {
              ...slot,
              slotType: targetSlotType,
              slotLabel: targetSlotLabel,
            }
          : slot,
      ),
    };
    const afterReport = evaluateComplianceFromContext(afterContext);
    const introducedFindings = getIntroducedErrorFindings(beforeReport, afterReport);

    if (introducedFindings.length > 0) {
      return apiError(
        409,
        "COMPLIANCE_VIOLATION",
        "Roster move would introduce new compliance errors.",
        {
          beforeStatus: beforeReport.status,
          afterStatus: afterReport.status,
          introducedFindings,
        },
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const rosterAssignmentService = createRosterAssignmentService(tx);
      const teamSeasonStateService = createTeamSeasonStateRecalculationService(tx);
      const nextSlot = await tx.rosterSlot.update({
        where: { id: existingSlot.id },
        data: {
          slotType: targetSlotType,
          slotLabel: targetSlotLabel,
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              nflTeam: true,
              injuryStatus: true,
            },
          },
        },
      });

      await rosterAssignmentService.ensureAssignmentForRosterSlot({
        teamId: team.id,
        seasonId: context.seasonId,
        playerId: existingSlot.player.id,
        slotType: nextSlot.slotType,
      });
      await teamSeasonStateService.recalculateTeamSeasonState({
        teamId: team.id,
        seasonId: context.seasonId,
      });

      return nextSlot;
    });

    await logTransaction(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: team.id,
      playerId: existingSlot.player.id,
      type: TransactionType.ROSTER_MOVE,
      summary: `Moved ${existingSlot.player.name} to ${targetSlotType}${targetSlotLabel ? ` (${targetSlotLabel})` : ""}.`,
      metadata: {
        rosterSlotId: existingSlot.id,
        before: {
          slotType: existingSlot.slotType,
          slotLabel: existingSlot.slotLabel,
        },
        after: {
          slotType: targetSlotType,
          slotLabel: targetSlotLabel,
        },
      },
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.ROSTER_MOVE_COMPLETED,
      eventCategory: "roster",
      eventStep: "move",
      status: "success",
      entityType: "roster_slot",
      entityId: updated.id,
      ...requestMeta,
      context: {
        action: body.action,
        targetSlotType,
        targetSlotLabel,
      },
    });

    return NextResponse.json({
      operation: "move",
      rosterSlot: updated,
    });
  }

  if (body.action === "add") {
    if (!body.playerId) {
      return apiError(400, "INVALID_REQUEST", "playerId is required for add.");
    }

    const slotType = parseSlotType(body.slotType);
    if (!slotType) {
      return apiError(400, "INVALID_REQUEST", "slotType is required for add.");
    }

    const player = await prisma.player.findUnique({
      where: {
        id: body.playerId,
      },
      select: {
        id: true,
        name: true,
        position: true,
        injuryStatus: true,
        nflTeam: true,
      },
    });

    if (!player) {
      return apiError(404, "PLAYER_NOT_FOUND", "Player was not found.");
    }

    const existingAssignment = await prisma.rosterSlot.findFirst({
      where: {
        seasonId: context.seasonId,
        playerId: player.id,
      },
      include: {
        team: {
          select: { id: true, name: true },
        },
      },
    });

    if (existingAssignment) {
      return apiError(409, "PLAYER_ALREADY_ROSTERED", "Player is already rostered this season.", {
        existingTeamId: existingAssignment.team.id,
        existingTeamName: existingAssignment.team.name,
      });
    }

    const sameTypeCount = validationContext.rosterSlots.filter((slot) => slot.slotType === slotType).length;
    const slotLabel = body.slotLabel?.trim() || buildDefaultSlotLabel(slotType, sameTypeCount);

    if (slotType === "STARTER" && !slotLabel) {
      return apiError(400, "INVALID_REQUEST", "slotLabel is required for STARTER adds.");
    }

    if (slotLabel) {
      const conflictingSlot = validationContext.rosterSlots.find(
        (slot) => slot.slotType === slotType && slot.slotLabel === slotLabel,
      );
      if (conflictingSlot) {
        return apiError(
          409,
          "ROSTER_SLOT_CONFLICT",
          `Target slot ${slotType} (${slotLabel}) is already occupied.`,
          {
            slotType,
            slotLabel,
            conflictingRosterSlotId: conflictingSlot.id,
            conflictingPlayerId: conflictingSlot.player.id,
          },
        );
      }
    }

    const afterContext = {
      ...validationContext,
      rosterSlots: [
        ...validationContext.rosterSlots,
        {
          id: `preview-roster-slot-${player.id}`,
          slotType,
          slotLabel,
          player: {
            id: player.id,
            name: player.name,
            position: player.position,
            injuryStatus: player.injuryStatus,
          },
        },
      ],
    };

    const afterReport = evaluateComplianceFromContext(afterContext);
    const introducedFindings = getIntroducedErrorFindings(beforeReport, afterReport);

    if (introducedFindings.length > 0) {
      return apiError(
        409,
        "COMPLIANCE_VIOLATION",
        "Roster add would introduce new compliance errors.",
        {
          beforeStatus: beforeReport.status,
          afterStatus: afterReport.status,
          introducedFindings,
        },
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const rosterAssignmentService = createRosterAssignmentService(tx);
      const teamSeasonStateService = createTeamSeasonStateRecalculationService(tx);
      const nextSlot = await tx.rosterSlot.create({
        data: {
          seasonId: context.seasonId,
          teamId: team.id,
          playerId: player.id,
          slotType,
          slotLabel,
        },
        include: {
          player: {
            select: {
              id: true,
              name: true,
              position: true,
              nflTeam: true,
              injuryStatus: true,
            },
          },
        },
      });

      await rosterAssignmentService.ensureAssignmentForRosterSlot({
        teamId: team.id,
        seasonId: context.seasonId,
        playerId: player.id,
        slotType: nextSlot.slotType,
        effectiveAt: nextSlot.createdAt,
      });
      await teamSeasonStateService.recalculateTeamSeasonState({
        teamId: team.id,
        seasonId: context.seasonId,
      });

      return nextSlot;
    });

    await logTransaction(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: team.id,
      playerId: player.id,
      type: TransactionType.ADD,
      summary: `Added ${player.name} to ${slotType}${slotLabel ? ` (${slotLabel})` : ""}.`,
      metadata: {
        rosterSlotId: created.id,
        slotType,
        slotLabel,
      },
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.ROSTER_ADD_COMPLETED,
      eventCategory: "roster",
      eventStep: "add",
      status: "success",
      entityType: "roster_slot",
      entityId: created.id,
      ...requestMeta,
      context: {
        action: "add",
        playerId: player.id,
        slotType,
        slotLabel,
      },
    });

    return NextResponse.json({
      operation: "add",
      rosterSlot: created,
    });
  }

  if (body.action === "drop") {
    const slotToDrop = body.rosterSlotId
      ? await prisma.rosterSlot.findFirst({
          where: {
            id: body.rosterSlotId,
            teamId: team.id,
            seasonId: context.seasonId,
          },
          include: {
            player: {
              select: {
                id: true,
                name: true,
                position: true,
                injuryStatus: true,
              },
            },
          },
        })
      : body.playerId
        ? await prisma.rosterSlot.findFirst({
            where: {
              playerId: body.playerId,
              teamId: team.id,
              seasonId: context.seasonId,
            },
            include: {
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  injuryStatus: true,
                },
              },
            },
          })
        : null;

    if (!slotToDrop) {
      return apiError(
        404,
        "ROSTER_SLOT_NOT_FOUND",
        "Roster slot was not found for drop. Provide rosterSlotId or playerId.",
      );
    }

    const afterContext = {
      ...validationContext,
      rosterSlots: validationContext.rosterSlots.filter((slot) => slot.id !== slotToDrop.id),
    };
    const afterReport = evaluateComplianceFromContext(afterContext);
    const introducedFindings = getIntroducedErrorFindings(beforeReport, afterReport);

    if (introducedFindings.length > 0) {
      return apiError(
        409,
        "COMPLIANCE_VIOLATION",
        "Roster drop would introduce new compliance errors.",
        {
          beforeStatus: beforeReport.status,
          afterStatus: afterReport.status,
          introducedFindings,
        },
      );
    }

    await prisma.$transaction(async (tx) => {
      const rosterAssignmentService = createRosterAssignmentService(tx);
      const teamSeasonStateService = createTeamSeasonStateRecalculationService(tx);

      await tx.rosterSlot.delete({
        where: {
          id: slotToDrop.id,
        },
      });
      await rosterAssignmentService.releaseAssignment({
        teamId: team.id,
        seasonId: context.seasonId,
        playerId: slotToDrop.player.id,
      });
      await teamSeasonStateService.recalculateTeamSeasonState({
        teamId: team.id,
        seasonId: context.seasonId,
      });
    });

    await logTransaction(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: team.id,
      playerId: slotToDrop.player.id,
      type: TransactionType.DROP,
      summary: `Dropped ${slotToDrop.player.name} from ${slotToDrop.slotType}${slotToDrop.slotLabel ? ` (${slotToDrop.slotLabel})` : ""}.`,
      metadata: {
        rosterSlotId: slotToDrop.id,
        slotType: slotToDrop.slotType,
        slotLabel: slotToDrop.slotLabel,
      },
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.ROSTER_DROP_COMPLETED,
      eventCategory: "roster",
      eventStep: "drop",
      status: "success",
      entityType: "roster_slot",
      entityId: slotToDrop.id,
      ...requestMeta,
      context: {
        action: "drop",
        playerId: slotToDrop.player.id,
        slotType: slotToDrop.slotType,
      },
    });

    return NextResponse.json({
      operation: "drop",
      dropped: {
        rosterSlotId: slotToDrop.id,
        playerId: slotToDrop.player.id,
      },
    });
  }

  if (body.action === "cut") {
    const slotToCut = body.rosterSlotId
      ? await prisma.rosterSlot.findFirst({
          where: {
            id: body.rosterSlotId,
            teamId: team.id,
            seasonId: context.seasonId,
          },
          include: {
            player: {
              select: {
                id: true,
                name: true,
                position: true,
                injuryStatus: true,
              },
            },
          },
        })
      : body.playerId
        ? await prisma.rosterSlot.findFirst({
            where: {
              playerId: body.playerId,
              teamId: team.id,
              seasonId: context.seasonId,
            },
            include: {
              player: {
                select: {
                  id: true,
                  name: true,
                  position: true,
                  injuryStatus: true,
                },
              },
            },
          })
        : null;

    if (!slotToCut) {
      return apiError(
        404,
        "ROSTER_SLOT_NOT_FOUND",
        "Roster slot was not found for cut. Provide rosterSlotId or playerId.",
      );
    }

    const { removedRosterSlots, removedContracts, terminatedContracts, deadCapChargeCount } =
      await prisma.$transaction(async (tx) => {
      const rosterAssignmentService = createRosterAssignmentService(tx);
      const teamSeasonStateService = createTeamSeasonStateRecalculationService(tx);
      const deadCapChargeService = createDeadCapChargeService(tx);
      const ledgerService = createContractLedgerService(tx);
      const effectiveCutAt = new Date();
      let createdDeadCapChargeCount = 0;

      const deletedRosterSlots = await tx.rosterSlot.deleteMany({
        where: {
          seasonId: context.seasonId,
          teamId: team.id,
          playerId: slotToCut.player.id,
        },
      });
      const activeContract = await tx.contract.findFirst({
        where: {
          seasonId: context.seasonId,
          teamId: team.id,
          playerId: slotToCut.player.id,
          status: {
            in: [...ACTIVE_CONTRACT_STATUSES],
          },
        },
        select: {
          id: true,
        },
      });

      if (activeContract) {
        const deadCapResult = await deadCapChargeService.applyCutDeadCap({
          leagueId: context.leagueId,
          teamId: team.id,
          seasonId: context.seasonId,
          contractId: activeContract.id,
          playerId: slotToCut.player.id,
          playerInjuryStatus: slotToCut.player.injuryStatus,
          createdByUserId: auth.actor?.userId ?? null,
          afterTradeDeadline: false,
          asOf: effectiveCutAt,
        });
        await tx.contract.update({
          where: {
            id: activeContract.id,
          },
          data: {
            status: "TERMINATED",
            yearsRemaining: 0,
            endedAt: effectiveCutAt,
          },
        });
        await ledgerService.syncContractLedger(activeContract.id);

        createdDeadCapChargeCount = deadCapResult.chargeCount;
      }

      await rosterAssignmentService.releaseAssignment({
        teamId: team.id,
        seasonId: context.seasonId,
        playerId: slotToCut.player.id,
      });
      await teamSeasonStateService.recalculateTeamSeasonState({
        teamId: team.id,
        seasonId: context.seasonId,
      });

      return {
        removedRosterSlots: deletedRosterSlots,
        removedContracts: {
          count: 0,
        },
        terminatedContracts: activeContract ? 1 : 0,
        deadCapChargeCount: createdDeadCapChargeCount,
      };
    });

    await logTransaction(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      teamId: team.id,
      playerId: slotToCut.player.id,
      type: TransactionType.DROP,
      summary: `Cut ${slotToCut.player.name} from ${team.name}.`,
      metadata: {
        action: "cut",
        rosterSlotsRemoved: removedRosterSlots.count,
        contractsRemoved: removedContracts.count,
        contractsTerminated: terminatedContracts,
        deadCapChargeCount,
        rosterSlotId: slotToCut.id,
      },
    });

    await recordPilotEventSafe(prisma, {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      actor: auth.actor,
      eventType: PILOT_EVENT_TYPES.ROSTER_CUT_COMPLETED,
      eventCategory: "roster",
      eventStep: "cut",
      status: "success",
      entityType: "player",
      entityId: slotToCut.player.id,
      ...requestMeta,
      context: {
        action: "cut",
        rosterSlotsRemoved: removedRosterSlots.count,
        contractsRemoved: removedContracts.count,
        contractsTerminated: terminatedContracts,
        deadCapChargeCount,
      },
    });

    return NextResponse.json({
      operation: "cut",
      cut: {
        playerId: slotToCut.player.id,
        rosterSlotsRemoved: removedRosterSlots.count,
        contractsRemoved: removedContracts.count,
        contractsTerminated: terminatedContracts,
        deadCapChargeCount,
      },
    });
  }

  return apiError(
    400,
    "INVALID_REQUEST",
    "Unsupported action. Expected one of: move, move_to_starter, move_to_bench, move_to_ir, add, drop, swap, cut.",
  );
}
