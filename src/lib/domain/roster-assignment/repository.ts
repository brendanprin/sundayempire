import { Prisma, PrismaClient, RosterStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type RosterAssignmentDbClient = PrismaClient | Prisma.TransactionClient;

export function createRosterAssignmentRepository(client: RosterAssignmentDbClient = prisma) {
  return {
    async findActiveAssignment(input: { teamId: string; seasonId: string; playerId: string }) {
      return client.rosterAssignment.findFirst({
        where: {
          teamId: input.teamId,
          seasonId: input.seasonId,
          playerId: input.playerId,
          endedAt: null,
        },
        orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
      });
    },
    async findActiveAssignmentsByTeamSeason(input: { teamId: string; seasonId: string }) {
      return client.rosterAssignment.findMany({
        where: {
          teamId: input.teamId,
          seasonId: input.seasonId,
          endedAt: null,
        },
        orderBy: [{ effectiveAt: "asc" }, { createdAt: "asc" }],
      });
    },
    async createAssignment(input: {
      teamId: string;
      seasonId: string;
      playerId: string;
      contractId?: string | null;
      rosterStatus: RosterStatus;
      acquisitionType?: "AUCTION" | "ROOKIE_DRAFT" | "WAIVER" | "TRADE" | "TAG" | "MANUAL" | "EMERGENCY_FILL_IN";
      effectiveAt: Date;
      hostPlatformReferenceId?: string | null;
    }) {
      return client.rosterAssignment.create({
        data: {
          teamId: input.teamId,
          seasonId: input.seasonId,
          playerId: input.playerId,
          contractId: input.contractId ?? null,
          rosterStatus: input.rosterStatus,
          acquisitionType: input.acquisitionType ?? "MANUAL",
          effectiveAt: input.effectiveAt,
          hostPlatformReferenceId: input.hostPlatformReferenceId ?? null,
        },
      });
    },
    async updateActiveAssignment(input: {
      id: string;
      rosterStatus?: RosterStatus;
      contractId?: string | null;
      hostPlatformReferenceId?: string | null;
    }) {
      return client.rosterAssignment.update({
        where: { id: input.id },
        data: {
          ...(input.rosterStatus ? { rosterStatus: input.rosterStatus } : {}),
          ...(input.contractId !== undefined ? { contractId: input.contractId } : {}),
          ...(input.hostPlatformReferenceId !== undefined
            ? { hostPlatformReferenceId: input.hostPlatformReferenceId }
            : {}),
        },
      });
    },
    async closeActiveAssignment(input: {
      id: string;
      endedAt: Date;
      nextStatus?: RosterStatus;
    }) {
      return client.rosterAssignment.update({
        where: { id: input.id },
        data: {
          endedAt: input.endedAt,
          ...(input.nextStatus ? { rosterStatus: input.nextStatus } : {}),
        },
      });
    },
  };
}
