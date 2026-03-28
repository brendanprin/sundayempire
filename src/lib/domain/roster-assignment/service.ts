import { Prisma, PrismaClient, RosterStatus, TeamSlotType } from "@prisma/client";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { createRosterAssignmentRepository } from "@/lib/domain/roster-assignment/repository";
import { prisma } from "@/lib/prisma";

type RosterAssignmentDbClient = PrismaClient | Prisma.TransactionClient;

function toRosterStatus(slotType: TeamSlotType): RosterStatus {
  return slotType === "IR" ? "IR" : "ACTIVE";
}

export function createRosterAssignmentService(client: RosterAssignmentDbClient = prisma) {
  const repository = createRosterAssignmentRepository(client);

  async function lookupContractId(input: { teamId: string; seasonId: string; playerId: string }) {
    const contract = await client.contract.findFirst({
      where: {
        teamId: input.teamId,
        seasonId: input.seasonId,
        playerId: input.playerId,
        status: {
          in: [...ACTIVE_CONTRACT_STATUSES],
        },
      },
      select: {
        id: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return contract?.id ?? null;
  }

  return {
    async ensureAssignmentForRosterSlot(input: {
      teamId: string;
      seasonId: string;
      playerId: string;
      slotType: TeamSlotType;
      effectiveAt?: Date;
    }) {
      const activeAssignment = await repository.findActiveAssignment(input);
      const desiredStatus = toRosterStatus(input.slotType);
      const contractId = await lookupContractId(input);

      if (!activeAssignment) {
        return repository.createAssignment({
          teamId: input.teamId,
          seasonId: input.seasonId,
          playerId: input.playerId,
          contractId,
          rosterStatus: desiredStatus,
          effectiveAt: input.effectiveAt ?? new Date(),
        });
      }

      if (activeAssignment.rosterStatus === desiredStatus && activeAssignment.contractId === contractId) {
        return activeAssignment;
      }

      if (activeAssignment.rosterStatus === desiredStatus) {
        return repository.updateActiveAssignment({
          id: activeAssignment.id,
          contractId,
        });
      }

      await repository.closeActiveAssignment({
        id: activeAssignment.id,
        endedAt: new Date(),
      });

      return repository.createAssignment({
        teamId: input.teamId,
        seasonId: input.seasonId,
        playerId: input.playerId,
        contractId,
        rosterStatus: desiredStatus,
        effectiveAt: new Date(),
      });
    },
    async releaseAssignment(input: {
      teamId: string;
      seasonId: string;
      playerId: string;
      releaseStatus?: Extract<RosterStatus, "RELEASED" | "MIRRORED_ONLY">;
    }) {
      const activeAssignment = await repository.findActiveAssignment(input);
      if (!activeAssignment) {
        return null;
      }

      return repository.closeActiveAssignment({
        id: activeAssignment.id,
        endedAt: new Date(),
        nextStatus: input.releaseStatus ?? "RELEASED",
      });
    },
  };
}
