import { LeagueRole, TeamMembershipType } from "@prisma/client";
import { createTeamSeasonStateRecalculationService } from "@/lib/domain/team-season-state/recalculation-service";
import { prisma } from "@/lib/prisma";

function pickPrimaryManager(input: {
  ownerUserId: string | null;
  memberships: {
    userId: string;
    createdAt: Date;
  }[];
}) {
  if (input.ownerUserId) {
    const ownerMatch = input.memberships.find((membership) => membership.userId === input.ownerUserId);
    if (ownerMatch) {
      return ownerMatch.userId;
    }
  }

  return [...input.memberships].sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0]?.userId ?? null;
}

async function backfillTeamMemberships() {
  const teams = await prisma.team.findMany({
    select: {
      id: true,
      owner: {
        select: {
          userId: true,
        },
      },
      memberships: {
        where: {
          role: {
            in: [LeagueRole.COMMISSIONER, LeagueRole.MEMBER],
          },
          userId: {
            not: "",
          },
        },
        select: {
          userId: true,
          createdAt: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  for (const team of teams) {
    if (team.memberships.length === 0) {
      continue;
    }

    const primaryUserId = pickPrimaryManager({
      ownerUserId: team.owner?.userId ?? null,
      memberships: team.memberships,
    });

    for (const membership of team.memberships) {
      const membershipType =
        membership.userId === primaryUserId ? TeamMembershipType.PRIMARY_MANAGER : TeamMembershipType.CO_MANAGER;

      await prisma.teamMembership.upsert({
        where: {
          teamId_userId_membershipType: {
            teamId: team.id,
            userId: membership.userId,
            membershipType,
          },
        },
        update: {
          isActive: true,
        },
        create: {
          teamId: team.id,
          userId: membership.userId,
          membershipType,
          isActive: true,
        },
      });
    }
  }
}

async function backfillRosterAssignments() {
  const [rosterSlots, contracts, existingAssignments] = await Promise.all([
    prisma.rosterSlot.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        seasonId: true,
        teamId: true,
        playerId: true,
        slotType: true,
        createdAt: true,
      },
    }),
    prisma.contract.findMany({
      select: {
        id: true,
        seasonId: true,
        teamId: true,
        playerId: true,
      },
    }),
    prisma.rosterAssignment.findMany({
      where: {
        endedAt: null,
      },
      select: {
        id: true,
        seasonId: true,
        teamId: true,
        playerId: true,
        rosterStatus: true,
        contractId: true,
      },
    }),
  ]);

  const contractIdByKey = new Map(
    contracts.map((contract) => [`${contract.seasonId}:${contract.teamId}:${contract.playerId}`, contract.id]),
  );
  const activeAssignmentsByKey = new Map(
    existingAssignments.map((assignment) => [
      `${assignment.seasonId}:${assignment.teamId}:${assignment.playerId}`,
      assignment,
    ]),
  );

  for (const slot of rosterSlots) {
    const assignmentKey = `${slot.seasonId}:${slot.teamId}:${slot.playerId}`;
    const desiredStatus = slot.slotType === "IR" ? "IR" : "ACTIVE";
    const desiredContractId = contractIdByKey.get(assignmentKey) ?? null;
    const existingAssignment = activeAssignmentsByKey.get(assignmentKey);

    if (!existingAssignment) {
      const created = await prisma.rosterAssignment.create({
        data: {
          teamId: slot.teamId,
          seasonId: slot.seasonId,
          playerId: slot.playerId,
          contractId: desiredContractId,
          acquisitionType: "MANUAL",
          rosterStatus: desiredStatus,
          effectiveAt: slot.createdAt,
        },
      });
      activeAssignmentsByKey.set(assignmentKey, created);
      continue;
    }

    if (
      existingAssignment.rosterStatus !== desiredStatus ||
      (existingAssignment.contractId ?? null) !== desiredContractId
    ) {
      const updated = await prisma.rosterAssignment.update({
        where: {
          id: existingAssignment.id,
        },
        data: {
          rosterStatus: desiredStatus,
          contractId: desiredContractId,
        },
      });
      activeAssignmentsByKey.set(assignmentKey, updated);
    }
  }
}

async function recalculateTeamSeasonStates() {
  const [activeSeasons, touchedSeasons, teams] = await Promise.all([
    prisma.season.findMany({
      where: {
        status: "ACTIVE",
      },
      select: {
        id: true,
        leagueId: true,
      },
    }),
    prisma.season.findMany({
      where: {
        OR: [
          { rosters: { some: {} } },
          { contracts: { some: {} } },
          { capPenalties: { some: {} } },
          { rosterAssignments: { some: {} } },
        ],
      },
      select: {
        id: true,
        leagueId: true,
      },
    }),
    prisma.team.findMany({
      select: {
        id: true,
        leagueId: true,
      },
    }),
  ]);

  const pairs = new Set<string>();
  for (const season of touchedSeasons) {
    const seasonTeams = teams.filter((team) => team.leagueId === season.leagueId);
    for (const team of seasonTeams) {
      pairs.add(`${team.id}:${season.id}`);
    }
  }

  for (const season of activeSeasons) {
    const seasonTeams = teams.filter((team) => team.leagueId === season.leagueId);
    for (const team of seasonTeams) {
      pairs.add(`${team.id}:${season.id}`);
    }
  }

  const service = createTeamSeasonStateRecalculationService(prisma);
  for (const pair of pairs) {
    const [teamId, seasonId] = pair.split(":");
    await service.recalculateTeamSeasonState({
      teamId,
      seasonId,
    });
  }
}

async function main() {
  await backfillTeamMemberships();
  await backfillRosterAssignments();
  await recalculateTeamSeasonStates();
  console.log("[backfill-s2] TeamMembership, RosterAssignment, and TeamSeasonState backfill complete.");
}

main()
  .catch((error) => {
    console.error("[backfill-s2] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
