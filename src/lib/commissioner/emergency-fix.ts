import { TransactionType } from "@prisma/client";
import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { createDeadCapChargeService } from "@/lib/domain/contracts/dead-cap-charge-service";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { createRosterAssignmentService } from "@/lib/domain/roster-assignment/service";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";
import { prisma } from "@/lib/prisma";
import { logTransaction } from "@/lib/transactions";

type FixCandidate = {
  playerId: string;
  playerName: string;
  playerPosition: string;
  salary: number;
  slotIds: string[];
  hasContract: boolean;
};

export type EmergencyFixResult = {
  team: {
    id: string;
    name: string;
  };
  dryRun: boolean;
  policy: {
    targetRosterMax: number;
    targetCapType: "soft" | "hard" | "custom";
    targetCapValue: number;
    dropOrder: "salary_desc";
  };
  before: {
    rosterCount: number;
    activeCapHit: number;
    deadCapHit: number;
    totalCapHit: number;
  };
  after: {
    rosterCount: number;
    activeCapHit: number;
    deadCapHit: number;
    totalCapHit: number;
  };
  droppedPlayers: {
    playerId: string;
    name: string;
    position: string;
    salary: number;
    hadContract: boolean;
    rosterSlotsRemoved: number;
  }[];
  unresolved: {
    rosterExcess: number;
    capOverage: number;
    hasUnresolved: boolean;
  };
};

function sortCandidates(a: FixCandidate, b: FixCandidate) {
  if (a.salary !== b.salary) {
    return b.salary - a.salary;
  }

  if (a.slotIds.length !== b.slotIds.length) {
    return b.slotIds.length - a.slotIds.length;
  }

  return a.playerName.localeCompare(b.playerName);
}

function buildFixCandidates(input: {
  rosterSlots: {
    id: string;
    playerId: string;
    player: {
      name: string;
      position: string;
    };
  }[];
  contracts: {
    playerId: string;
    salary: number;
    player: {
      name: string;
      position: string;
    };
  }[];
}): FixCandidate[] {
  const byPlayer = new Map<string, FixCandidate>();

  for (const slot of input.rosterSlots) {
    const existing = byPlayer.get(slot.playerId);
    if (existing) {
      existing.slotIds.push(slot.id);
      continue;
    }

    byPlayer.set(slot.playerId, {
      playerId: slot.playerId,
      playerName: slot.player.name,
      playerPosition: slot.player.position,
      salary: 0,
      slotIds: [slot.id],
      hasContract: false,
    });
  }

  for (const contract of input.contracts) {
    const existing = byPlayer.get(contract.playerId);
    if (existing) {
      existing.salary = contract.salary;
      existing.hasContract = true;
      continue;
    }

    byPlayer.set(contract.playerId, {
      playerId: contract.playerId,
      playerName: contract.player.name,
      playerPosition: contract.player.position,
      salary: contract.salary,
      slotIds: [],
      hasContract: true,
    });
  }

  return [...byPlayer.values()].sort(sortCandidates);
}

export async function runEmergencyComplianceFix(input: {
  leagueId: string;
  seasonId: string;
  teamId: string;
  targetRosterMax: number;
  targetCapType: "soft" | "hard" | "custom";
  targetCapValue: number;
  actor?: string;
  dryRun?: boolean;
}): Promise<EmergencyFixResult> {
  const dryRun = Boolean(input.dryRun);

  const team = await prisma.team.findFirst({
    where: {
      id: input.teamId,
      leagueId: input.leagueId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!team) {
    throw new Error("TEAM_NOT_FOUND");
  }

  const [rosterSlots, contracts, capPenalties] = await Promise.all([
    prisma.rosterSlot.findMany({
      where: {
        seasonId: input.seasonId,
        teamId: team.id,
      },
      include: {
        player: {
          select: {
            name: true,
            position: true,
          },
        },
      },
    }),
    prisma.contract.findMany({
      where: {
        seasonId: input.seasonId,
        teamId: team.id,
        status: {
          in: [...ACTIVE_CONTRACT_STATUSES],
        },
      },
      include: {
        player: {
          select: {
            name: true,
            position: true,
          },
        },
      },
    }),
    prisma.capPenalty.findMany({
      where: {
        seasonId: input.seasonId,
        teamId: team.id,
      },
      select: {
        amount: true,
      },
    }),
  ]);

  const initialDeadCapHit = capPenalties.reduce((total, penalty) => total + penalty.amount, 0);
  const initialActiveCapHit = contracts.reduce((total, contract) => total + contract.salary, 0);
  const initialRosterCount = rosterSlots.length;

  const candidates = buildFixCandidates({
    rosterSlots,
    contracts,
  });

  let rosterCount = initialRosterCount;
  let activeCapHit = initialActiveCapHit;
  let deadCapHit = initialDeadCapHit;
  const droppedCandidates: FixCandidate[] = [];

  for (const candidate of candidates) {
    const totalCapHit = activeCapHit + deadCapHit;
    const needsDrop =
      rosterCount > input.targetRosterMax || totalCapHit > input.targetCapValue;

    if (!needsDrop) {
      break;
    }

    droppedCandidates.push(candidate);
    rosterCount -= candidate.slotIds.length;
    if (candidate.hasContract) {
      activeCapHit -= candidate.salary;
      deadCapHit += candidate.salary;
    }
  }

  const finalTotalCapHit = activeCapHit + deadCapHit;
  const unresolved = {
    rosterExcess: Math.max(0, rosterCount - input.targetRosterMax),
    capOverage: Math.max(0, finalTotalCapHit - input.targetCapValue),
    hasUnresolved:
      rosterCount > input.targetRosterMax || finalTotalCapHit > input.targetCapValue,
  };

  if (!dryRun) {
    await prisma.$transaction(async (tx) => {
      const deadCapChargeService = createDeadCapChargeService(tx);
      const ledgerService = createContractLedgerService(tx);
      const rosterAssignmentService = createRosterAssignmentService(tx);
      const teamSeasonStateService = createTeamSeasonStateRecalculationService(tx);

      for (const candidate of droppedCandidates) {
        await tx.rosterSlot.deleteMany({
          where: {
            seasonId: input.seasonId,
            teamId: team.id,
            playerId: candidate.playerId,
          },
        });

        const activeContract = await tx.contract.findFirst({
          where: {
            seasonId: input.seasonId,
            teamId: team.id,
            playerId: candidate.playerId,
            status: {
              in: [...ACTIVE_CONTRACT_STATUSES],
            },
          },
          select: {
            id: true,
            player: {
              select: {
                injuryStatus: true,
              },
            },
          },
        });

        if (activeContract) {
          const droppedAt = new Date();
          await deadCapChargeService.applyCutDeadCap({
            leagueId: input.leagueId,
            teamId: team.id,
            seasonId: input.seasonId,
            contractId: activeContract.id,
            playerId: candidate.playerId,
            playerInjuryStatus: activeContract.player.injuryStatus,
            createdByUserId: null,
            afterTradeDeadline: false,
            asOf: droppedAt,
          });
          await tx.contract.update({
            where: {
              id: activeContract.id,
            },
            data: {
              status: "TERMINATED",
              yearsRemaining: 0,
              endedAt: droppedAt,
            },
          });
          await ledgerService.syncContractLedger(activeContract.id);
        }
        await rosterAssignmentService.releaseAssignment({
          teamId: team.id,
          seasonId: input.seasonId,
          playerId: candidate.playerId,
        });

        await logTransaction(tx, {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: team.id,
          playerId: candidate.playerId,
          type: TransactionType.DROP,
          summary: `Commissioner dropped ${candidate.playerName} during emergency compliance fix.`,
          metadata: {
            reason: "emergency_compliance_fix",
            rosterSlotsRemoved: candidate.slotIds.length,
            salaryCleared: candidate.salary,
            hadContract: candidate.hasContract,
            updatedBy: input.actor ?? "api/commissioner/override/fix-team POST",
          },
        });
      }

      await teamSeasonStateService.recalculateTeamSeasonState({
        teamId: team.id,
        seasonId: input.seasonId,
      });

      await logTransaction(tx, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        teamId: team.id,
        type: TransactionType.COMMISSIONER_OVERRIDE,
        summary:
          droppedCandidates.length > 0
            ? `Emergency compliance fix dropped ${droppedCandidates.length} players from ${team.name}.`
            : `Emergency compliance fix ran for ${team.name} with no drops required.`,
        metadata: {
          policy: {
            targetRosterMax: input.targetRosterMax,
            targetCapType: input.targetCapType,
            targetCapValue: input.targetCapValue,
            dropOrder: "salary_desc",
          },
          before: {
            rosterCount: initialRosterCount,
            activeCapHit: initialActiveCapHit,
            deadCapHit: initialDeadCapHit,
            totalCapHit: initialActiveCapHit + initialDeadCapHit,
          },
          after: {
            rosterCount,
            activeCapHit,
            deadCapHit,
            totalCapHit: finalTotalCapHit,
          },
          droppedPlayers: droppedCandidates.map((candidate) => ({
            playerId: candidate.playerId,
            name: candidate.playerName,
            position: candidate.playerPosition,
            salary: candidate.salary,
            hadContract: candidate.hasContract,
            rosterSlotsRemoved: candidate.slotIds.length,
          })),
          unresolved,
          updatedBy: input.actor ?? "api/commissioner/override/fix-team POST",
        },
      });
    });
  }

  return {
    team: {
      id: team.id,
      name: team.name,
    },
    dryRun,
    policy: {
      targetRosterMax: input.targetRosterMax,
      targetCapType: input.targetCapType,
      targetCapValue: input.targetCapValue,
      dropOrder: "salary_desc",
    },
    before: {
      rosterCount: initialRosterCount,
      activeCapHit: initialActiveCapHit,
      deadCapHit: initialDeadCapHit,
      totalCapHit: initialActiveCapHit + initialDeadCapHit,
    },
    after: {
      rosterCount,
      activeCapHit,
      deadCapHit,
      totalCapHit: finalTotalCapHit,
    },
    droppedPlayers: droppedCandidates.map((candidate) => ({
      playerId: candidate.playerId,
      name: candidate.playerName,
      position: candidate.playerPosition,
      salary: candidate.salary,
      hadContract: candidate.hasContract,
      rosterSlotsRemoved: candidate.slotIds.length,
    })),
    unresolved,
  };
}
