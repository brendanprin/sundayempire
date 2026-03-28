import { Prisma, PrismaClient, TeamMembershipType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type TeamMembershipDbClient = PrismaClient | Prisma.TransactionClient;

export function createTeamMembershipRepository(client: TeamMembershipDbClient = prisma) {
  async function listActiveMembershipsForUserInLeague(userId: string, leagueId: string) {
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
      orderBy: [{ membershipType: "asc" }, { createdAt: "asc" }],
    });
  }

  async function upsertMembership(input: {
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
  }

  async function findActivePrimaryManagerForTeam(teamId: string) {
    return client.teamMembership.findFirst({
      where: {
        teamId,
        isActive: true,
        membershipType: TeamMembershipType.PRIMARY_MANAGER,
      },
      select: {
        id: true,
        teamId: true,
        userId: true,
      },
    });
  }

  async function deactivatePrimaryManagersForUserInLeague(input: {
    userId: string;
    leagueId: string;
    keepTeamId?: string | null;
  }) {
    const activePrimaryMemberships = await client.teamMembership.findMany({
      where: {
        userId: input.userId,
        isActive: true,
        membershipType: TeamMembershipType.PRIMARY_MANAGER,
        team: {
          leagueId: input.leagueId,
        },
        ...(input.keepTeamId
          ? {
              teamId: {
                not: input.keepTeamId,
              },
            }
          : {}),
      },
      select: {
        id: true,
      },
    });

    if (activePrimaryMemberships.length === 0) {
      return 0;
    }

    const deactivated = await client.teamMembership.updateMany({
      where: {
        id: {
          in: activePrimaryMemberships.map((membership) => membership.id),
        },
      },
      data: {
        isActive: false,
      },
    });

    return deactivated.count;
  }

  async function assignPrimaryManagerMembershipInLeague(input: {
    userId: string;
    teamId: string;
    leagueId: string;
  }) {
    await deactivatePrimaryManagersForUserInLeague({
      userId: input.userId,
      leagueId: input.leagueId,
      keepTeamId: input.teamId,
    });

    return upsertMembership({
      teamId: input.teamId,
      userId: input.userId,
      membershipType: TeamMembershipType.PRIMARY_MANAGER,
      isActive: true,
    });
  }

  return {
    listActiveMembershipsForUserInLeague,
    upsertMembership,
    findActivePrimaryManagerForTeam,
    deactivatePrimaryManagersForUserInLeague,
    assignPrimaryManagerMembershipInLeague,
  };
}
