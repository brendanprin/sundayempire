import { LeagueRole, Prisma, PrismaClient, TeamMembershipType } from "@prisma/client";
import { createTeamMembershipRepository } from "@/lib/domain/team-membership/repository";
import { ResolvedActorContext } from "@/lib/domain/team-membership/types";
import { prisma } from "@/lib/prisma";
import { toCanonicalLeagueRole } from "@/lib/role-model";

type ActorContextDbClient = PrismaClient | Prisma.TransactionClient;

function rankMembershipType(type: TeamMembershipType) {
  return type === "PRIMARY_MANAGER" ? 0 : 1;
}

function chooseResolvedTeamMembership(
  memberships: {
    teamId: string;
    membershipType: TeamMembershipType;
    createdAt: Date;
    team: {
      id: string;
      name: string;
      leagueId: string;
    };
  }[],
) {
  return [...memberships].sort((left, right) => {
    const rankDelta = rankMembershipType(left.membershipType) - rankMembershipType(right.membershipType);
    if (rankDelta !== 0) {
      return rankDelta;
    }

    return left.createdAt.getTime() - right.createdAt.getTime();
  })[0] ?? null;
}

export function createActorContextService(client: ActorContextDbClient = prisma) {
  const teamMembershipRepository = createTeamMembershipRepository(client);

  async function resolveActorForUserId(
    userId: string,
    leagueId: string,
  ): Promise<ResolvedActorContext | null> {
    const user = await client.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        platformRole: true,
        memberships: {
          where: { leagueId },
          select: {
            leagueId: true,
            role: true,
            teamId: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          take: 1,
        },
      },
    });

    if (!user || user.memberships.length === 0) {
      return null;
    }

    const leagueMembership = user.memberships[0];
    const activeTeamMemberships = await teamMembershipRepository.listActiveMembershipsForUserInLeague(
      user.id,
      leagueId,
    );
    const preferredTeamMembership = chooseResolvedTeamMembership(activeTeamMemberships);
    const leagueRole = toCanonicalLeagueRole(leagueMembership.role);

    if (preferredTeamMembership) {
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        leagueId: leagueMembership.leagueId,
        accountRole: user.platformRole,
        leagueRole,
        teamId: preferredTeamMembership.team.id,
        teamName: preferredTeamMembership.team.name,
        teamMembershipType: preferredTeamMembership.membershipType,
        resolutionSource: "TEAM_MEMBERSHIP",
      };
    }

    if (leagueMembership.teamId) {
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        leagueId: leagueMembership.leagueId,
        accountRole: user.platformRole,
        leagueRole,
        teamId: leagueMembership.teamId,
        teamName: leagueMembership.team?.name ?? null,
        teamMembershipType: null,
        resolutionSource: "LEAGUE_MEMBERSHIP",
      };
    }

    if (leagueMembership.role === LeagueRole.COMMISSIONER) {
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        leagueId: leagueMembership.leagueId,
        accountRole: user.platformRole,
        leagueRole,
        teamId: null,
        teamName: null,
        teamMembershipType: null,
        resolutionSource: "COMMISSIONER_NO_TEAM",
      };
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      leagueId: leagueMembership.leagueId,
      accountRole: user.platformRole,
      leagueRole,
      teamId: null,
      teamName: null,
      teamMembershipType: null,
      resolutionSource: "LEAGUE_MEMBERSHIP",
    };
  }

  return {
    async resolveActorForLeagueByEmail(email: string, leagueId: string) {
      const normalizedEmail = email.trim().toLowerCase();
      const user = await client.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      });

      if (!user) {
        return null;
      }

      return resolveActorForUserId(user.id, leagueId);
    },
    resolveActorForUserId,
  };
}
