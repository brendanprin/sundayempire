import { LeagueRole, TransactionType } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { ACTIVE_LEAGUE_COOKIE, requirePlatformRole } from "@/lib/auth";
import { createLeagueInviteService } from "@/lib/domain/auth/LeagueInviteService";
import { assertLeagueHasOperationalCommissioner } from "@/lib/domain/league-membership/commissioner-assignment";
import { getDefaultLifecycleDeadlines } from "@/lib/domain/lifecycle/default-deadlines";
import { toLegacyLeaguePhase } from "@/lib/domain/lifecycle/phase-compat";
import { selectPreferredSeason } from "@/lib/domain/lifecycle/season-selection";
import { prisma } from "@/lib/prisma";
import { toCanonicalLeagueRole } from "@/lib/role-model";
import { logTransaction } from "@/lib/transactions";

const DEFAULT_RULESET = {
  rosterSize: 17,
  starterQb: 1,
  starterQbFlex: 1,
  starterRb: 2,
  starterWr: 3,
  starterTe: 1,
  starterFlex: 1,
  starterDst: 1,
  irSlots: 2,
  salaryCapSoft: 245,
  salaryCapHard: 300,
  waiverBidMaxAtOrAboveSoftCap: 0,
  minContractYears: 1,
  maxContractYears: 4,
  minSalary: 1,
  maxContractYearsIfSalaryBelowTen: 3,
  rookieBaseYears: 1,
  rookieOptionYears: 2,
  franchiseTagsPerTeam: 1,
  tradeDeadlineWeek: 11,
  regularSeasonWeeks: 13,
  playoffStartWeek: 14,
  playoffEndWeek: 16,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeOptionalEmail(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    return null;
  }

  return email;
}

export async function GET(request: NextRequest) {
  const access = await requirePlatformRole(request, ["ADMIN", "USER"]);
  if (access.response || !access.user) {
    return access.response ?? apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const memberships = await prisma.leagueMembership.findMany({
    where: { userId: access.user.id },
    orderBy: {
      league: {
        createdAt: "asc",
      },
    },
    select: {
      role: true,
      teamId: true,
      team: {
        select: {
          id: true,
          name: true,
        },
      },
      league: {
        select: {
          id: true,
          name: true,
          description: true,
          createdAt: true,
          seasons: {
            orderBy: { year: "desc" },
            select: {
              id: true,
              year: true,
              phase: true,
              status: true,
            },
          },
          _count: {
            select: {
              teams: true,
              memberships: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    leagues: memberships.map((membership) => {
      const selectedSeason = selectPreferredSeason(membership.league.seasons);
      const leagueRole = toCanonicalLeagueRole(membership.role);

      return {
        id: membership.league.id,
        name: membership.league.name,
        description: membership.league.description,
        leagueRole,
        teamId: membership.teamId,
        teamName: membership.team?.name ?? null,
        season: selectedSeason
          ? {
              id: selectedSeason.id,
              year: selectedSeason.year,
              phase: toLegacyLeaguePhase(selectedSeason.phase),
            }
          : null,
        counts: {
          teams: membership.league._count.teams,
          memberships: membership.league._count.memberships,
        },
        createdAt: membership.league.createdAt.toISOString(),
      };
    }),
  });
}

export async function POST(request: NextRequest) {
  const access = await requirePlatformRole(request, ["ADMIN", "USER"]);
  if (access.response || !access.user) {
    return access.response ?? apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }
  const user = access.user;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    description?: unknown;
    seasonYear?: unknown;
    designatedCommissionerEmail?: unknown;
  };

  if (typeof body.name !== "string" || body.name.trim().length < 2) {
    return apiError(400, "INVALID_REQUEST", "League name must be at least 2 characters.");
  }
  if (body.description !== undefined && body.description !== null && typeof body.description !== "string") {
    return apiError(400, "INVALID_REQUEST", "description must be a string or null.");
  }
  if (body.seasonYear !== undefined && !Number.isInteger(body.seasonYear)) {
    return apiError(400, "INVALID_REQUEST", "seasonYear must be an integer when provided.");
  }
  if (
    body.designatedCommissionerEmail !== undefined &&
    body.designatedCommissionerEmail !== null &&
    typeof body.designatedCommissionerEmail !== "string"
  ) {
    return apiError(
      400,
      "INVALID_REQUEST",
      "designatedCommissionerEmail must be a valid email string when provided.",
    );
  }

  const seasonYear =
    typeof body.seasonYear === "number" && Number.isInteger(body.seasonYear)
      ? body.seasonYear
      : new Date().getFullYear();

  if (seasonYear < 2000 || seasonYear > 2100) {
    return apiError(400, "INVALID_REQUEST", "seasonYear must be between 2000 and 2100.");
  }
  const leagueName = body.name.trim();
  const leagueDescription =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;
  const designatedCommissionerEmail = normalizeOptionalEmail(body.designatedCommissionerEmail);

  if (body.designatedCommissionerEmail !== undefined && body.designatedCommissionerEmail !== null) {
    if (!designatedCommissionerEmail) {
      return apiError(
        400,
        "INVALID_REQUEST",
        "designatedCommissionerEmail must be a valid email address when provided.",
      );
    }
  }

  const creatorEmail = user.email.trim().toLowerCase();
  const shouldCreatePendingCommissionerInvite =
    Boolean(designatedCommissionerEmail) &&
    designatedCommissionerEmail !== creatorEmail;

  const created = await prisma.$transaction(async (tx) => {
    const league = await tx.league.create({
      data: {
        name: leagueName,
        description: leagueDescription,
      },
    });

    const season = await tx.season.create({
      data: {
        leagueId: league.id,
        year: seasonYear,
        status: "ACTIVE",
        phase: "PRESEASON_SETUP",
        openedAt: new Date(),
        regularSeasonWeeks: DEFAULT_RULESET.regularSeasonWeeks,
        playoffStartWeek: DEFAULT_RULESET.playoffStartWeek,
        playoffEndWeek: DEFAULT_RULESET.playoffEndWeek,
      },
    });

    for (const deadline of getDefaultLifecycleDeadlines(season.year)) {
      await tx.leagueDeadline.create({
        data: {
          leagueId: league.id,
          seasonId: season.id,
          ...deadline,
        },
      });
    }

    await tx.leagueRuleSet.create({
      data: {
        leagueId: league.id,
        version: 1,
        isActive: true,
        ...DEFAULT_RULESET,
      },
    });

    const membership = await tx.leagueMembership.create({
      data: {
        userId: user.id,
        leagueId: league.id,
        role: LeagueRole.COMMISSIONER,
        teamId: null,
      },
      select: {
        id: true,
        role: true,
      },
    });

    const pendingCommissionerInvite = shouldCreatePendingCommissionerInvite
      ? await createLeagueInviteService(tx).createInvite({
          leagueId: league.id,
          email: designatedCommissionerEmail!,
          intendedRole: "COMMISSIONER",
          invitedByUserId: user.id,
          origin: request.nextUrl.origin,
        })
      : null;

    await assertLeagueHasOperationalCommissioner(tx, {
      leagueId: league.id,
      operation: "LEAGUE_BOOTSTRAP",
    });

    await logTransaction(tx, {
      leagueId: league.id,
      seasonId: season.id,
      type: TransactionType.COMMISSIONER_OVERRIDE,
      summary: shouldCreatePendingCommissionerInvite
        ? `Created league workspace "${league.name}" with acting commissioner and pending commissioner designation.`
        : `Created league workspace "${league.name}".`,
      metadata: {
        updatedBy: "api/leagues POST",
        actor: {
          userId: user.id,
          email: user.email,
          platformRole: user.platformRole,
        },
        pendingCommissionerInvite: pendingCommissionerInvite
          ? {
              inviteId: pendingCommissionerInvite.invite.id,
              email: pendingCommissionerInvite.invite.email,
              intendedLeagueRole: pendingCommissionerInvite.invite.intendedRole,
              expiresAt: pendingCommissionerInvite.invite.expiresAt,
              deliveryState: pendingCommissionerInvite.deliveryView.state,
            }
          : null,
      },
    });

    return {
      league,
      season,
      membership,
      pendingCommissionerInvite: pendingCommissionerInvite
        ? {
            id: pendingCommissionerInvite.invite.id,
            email: pendingCommissionerInvite.invite.email,
            intendedRole: pendingCommissionerInvite.invite.intendedRole,
            expiresAt: pendingCommissionerInvite.invite.expiresAt,
            deliveryState: pendingCommissionerInvite.deliveryView.state,
          }
        : null,
    };
  });

  const response = NextResponse.json(
    {
      league: {
        id: created.league.id,
        name: created.league.name,
        description: created.league.description,
      },
      season: {
        id: created.season.id,
        year: created.season.year,
        phase: toLegacyLeaguePhase(created.season.phase),
      },
      membership: {
        id: created.membership.id,
        leagueRole: toCanonicalLeagueRole(created.membership.role),
      },
      commissioner: {
        activeUserId: user.id,
        activeEmail: user.email,
        acting: Boolean(created.pendingCommissionerInvite),
      },
      pendingCommissionerDesignation: created.pendingCommissionerInvite
        ? {
            inviteId: created.pendingCommissionerInvite.id,
            email: created.pendingCommissionerInvite.email,
            intendedRole: created.pendingCommissionerInvite.intendedRole,
            intendedLeagueRole: toCanonicalLeagueRole(
              created.pendingCommissionerInvite.intendedRole,
            ),
            expiresAt: created.pendingCommissionerInvite.expiresAt.toISOString(),
            deliveryState: created.pendingCommissionerInvite.deliveryState,
          }
        : null,
    },
    { status: 201 },
  );
  response.cookies.set(ACTIVE_LEAGUE_COOKIE, created.league.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
