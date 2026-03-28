import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, isDemoAuthLoginEnabled } from "@/lib/auth";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole, toCanonicalLeagueRole } from "@/lib/role-model";

type AuthIdentity = {
  email: string;
  name: string | null;
  leagueRole: CanonicalLeagueRole;
  teamId: string | null;
  teamName: string | null;
};

const ROLE_SORT_ORDER: Record<CanonicalLeagueRole, number> = {
  COMMISSIONER: 0,
  MEMBER: 1,
};

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  const demoAuthEnabled = isDemoAuthLoginEnabled();

  if (!demoAuthEnabled) {
    return NextResponse.json({
      activeEmail: user?.email ?? null,
      demoAuthEnabled: false,
      identities: [] satisfies AuthIdentity[],
    });
  }

  const context = await getActiveLeagueContext();
  const demoLeagueId =
    context?.leagueId ??
    (await prisma.league.findFirst({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
      },
    }).then((league) => league?.id ?? null));

  if (!demoLeagueId) {
    return NextResponse.json({
      activeEmail: user?.email ?? null,
      demoAuthEnabled: true,
      identities: [] satisfies AuthIdentity[],
    });
  }

  const memberships = await prisma.leagueMembership.findMany({
    where: { leagueId: demoLeagueId },
    select: {
      role: true,
      teamId: true,
      team: {
        select: {
          name: true,
        },
      },
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  const identities: AuthIdentity[] = memberships
    .map((membership) => {
      const leagueRole = toCanonicalLeagueRole(membership.role);
      return {
        email: membership.user.email,
        name: membership.user.name,
        leagueRole,
        teamId: membership.teamId,
        teamName: membership.team?.name ?? null,
      };
    })
    .sort((left, right) => {
      const roleDelta = ROLE_SORT_ORDER[left.leagueRole] - ROLE_SORT_ORDER[right.leagueRole];
      if (roleDelta !== 0) {
        return roleDelta;
      }
      if (left.teamId && !right.teamId) {
        return -1;
      }
      if (!left.teamId && right.teamId) {
        return 1;
      }
      return left.email.localeCompare(right.email);
    });

  return NextResponse.json({
    activeEmail: user?.email ?? null,
    demoAuthEnabled: true,
    identities,
  });
}
