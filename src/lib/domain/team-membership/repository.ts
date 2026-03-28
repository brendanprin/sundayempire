import { Prisma, PrismaClient, TeamMembershipType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TeamMembershipDbClient = PrismaClient | Prisma.TransactionClient;

export function createTeamMembershipRepository(client: TeamMembershipDbClient = prisma) {
  return {
    async listActiveMembershipsForUserInLeague(userId: string, leagueId: string) {
      return client.teamMembership.findMany({
        where: {
          userId,
          isActive: true,
          team: {
            leagueId,
          },
        },
        select: {
          id: true,
          teamId: true,
          userId: true,
          membershipType: true,
          createdAt: true,
          updatedAt: true,
          team: {
            select: {
              id: true,
              name: true,
              leagueId: true,
            },
          },
        },
        orderBy: [
          { membershipType: "asc" },
          { createdAt: "asc" },
        ],
      });
    },
    async upsertMembership(input: {
      teamId: string;
      userId: string;
      membershipType: TeamMembershipType;
      isActive?: boolean;
    }) {
      return client.teamMembership.upsert({
        where: {
          teamId_userId_membershipType: {
            teamId: input.teamId,
            userId: input.userId,
            membershipType: input.membershipType,
          },
        },
        update: {
          isActive: input.isActive ?? true,
        },
        create: {
          teamId: input.teamId,
          userId: input.userId,
          membershipType: input.membershipType,
          isActive: input.isActive ?? true,
        },
      });
    },
  };
}
