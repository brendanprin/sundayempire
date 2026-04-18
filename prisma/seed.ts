import {
  LeagueRole,
  PlatformRole,
  Position,
  PrismaClient,
  TeamMembershipType,
  TeamSlotType,
} from "@prisma/client";
import { PLAYER_POSITION_ORDER } from "./player-data-provider";
import { createFantasyProsSeedProvider } from "./providers/fantasypros-seed-provider";
import { getDefaultLifecycleDeadlines } from "../src/lib/domain/lifecycle/default-deadlines";
import { normalizePlayerSearchName } from "../src/lib/domain/player/normalization";

const prisma = new PrismaClient();

const LEAGUE_NAME = "Dynasty Contract Football";
const COMMISSIONER_EMAIL = "commissioner@local.league";
const COMMISSIONER_NAME = "League Commissioner";
const READ_ONLY_EMAIL = "readonly@local.league";
const READ_ONLY_NAME = "League Observer";
const PLATFORM_ADMIN_EMAIL = "platform-admin@local.league";
const PLATFORM_ADMIN_NAME = "Platform Admin";
const NO_LEAGUE_USER_EMAIL = "noleague@local.league";
const NO_LEAGUE_USER_NAME = "No League User";
const INITIAL_SEASON_YEAR = 2025;
const INITIAL_SEASON_PHASE = "OFFSEASON_ROLLOVER" as const;
const TEAM_COUNT = 12;
const ROSTER_SIZE = 17;
const LEGACY_CANONICAL_PLAYER_PREFIX = "canonical-v";
const SEEDED_RANDOM_SEED = 2025;
const FUTURE_PICK_START_YEAR = INITIAL_SEASON_YEAR + 1;
const FUTURE_PICK_END_YEAR = 2031;

const TEAM_BLUEPRINTS = [
  { name: "Northside Night Owls", abbreviation: "NNO", ownerName: "Owner 01" },
  { name: "Cannonball Club", abbreviation: "CBC", ownerName: "Owner 02" },
  { name: "Kings of Sunday", abbreviation: "KOS", ownerName: "Owner 03" },
  { name: "Fourth and Forever", abbreviation: "FAF", ownerName: "Owner 04" },
  { name: "Cap Casualties", abbreviation: "CAP", ownerName: "Owner 05" },
  { name: "Trade Block Heroes", abbreviation: "TBH", ownerName: "Owner 06" },
  { name: "Bylaw Bandits", abbreviation: "BYL", ownerName: "Owner 07" },
  { name: "Roster Wreckers", abbreviation: "RWR", ownerName: "Owner 08" },
  { name: "Dynasty Defenders", abbreviation: "DYN", ownerName: "Owner 09" },
  { name: "Waiver Wire Wolves", abbreviation: "WWW", ownerName: "Owner 10" },
  { name: "Contract Chaos", abbreviation: "CHA", ownerName: "Owner 11" },
  { name: "Superflex Syndicate", abbreviation: "SFX", ownerName: "Owner 12" },
];

type SlotTemplate = {
  slotType: TeamSlotType;
  slotLabel: string;
};

function buildRosterTemplate(): SlotTemplate[] {
  return [
    { slotType: "STARTER", slotLabel: "QB" },
    { slotType: "STARTER", slotLabel: "QB_FLEX" },
    { slotType: "STARTER", slotLabel: "RB1" },
    { slotType: "STARTER", slotLabel: "RB2" },
    { slotType: "STARTER", slotLabel: "WR1" },
    { slotType: "STARTER", slotLabel: "WR2" },
    { slotType: "STARTER", slotLabel: "WR3" },
    { slotType: "STARTER", slotLabel: "TE" },
    { slotType: "STARTER", slotLabel: "FLEX" },
    { slotType: "STARTER", slotLabel: "DST" },
    { slotType: "BENCH", slotLabel: "BENCH1" },
    { slotType: "BENCH", slotLabel: "BENCH2" },
    { slotType: "BENCH", slotLabel: "BENCH3" },
    { slotType: "BENCH", slotLabel: "BENCH4" },
    { slotType: "BENCH", slotLabel: "BENCH5" },
    { slotType: "BENCH", slotLabel: "BENCH6" },
    { slotType: "BENCH", slotLabel: "BENCH7" },
  ];
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(values: T[], random: () => number) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  return values;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function determineSeedSalary(
  player: {
    position: Position;
  },
  overallRank: number,
  poolSize: number,
  random: () => number,
) {
  const percentile = poolSize <= 1 ? 1 : 1 - (overallRank - 1) / (poolSize - 1);
  let salary = 1 + Math.round(percentile * 22);

  if (player.position === "QB") {
    salary += overallRank <= TEAM_COUNT * 2 ? 4 : 2;
  }

  if (player.position === "TE" && overallRank <= 72) {
    salary += 1;
  }

  if (player.position === "DST") {
    salary = Math.min(salary, 3);
  }

  if (player.position === "K") {
    salary = Math.min(salary, 2);
  }

  const jitter = Math.floor(random() * 5) - 2;
  return clamp(salary + jitter, 1, 30);
}

function determineContractYears(salary: number, random: () => number) {
  const maxYears = salary < 10 ? 3 : 4;
  const minYears = salary >= 20 ? 2 : 1;
  return minYears + Math.floor(random() * (maxYears - minYears + 1));
}

function determineRookieFlag(
  player: {
    position: Position;
  },
  overallRank: number,
  salary: number,
  random: () => number,
) {
  if (player.position === "DST" || player.position === "K") {
    return false;
  }

  if (overallRank <= 120 || salary > 10) {
    return false;
  }

  return random() < 0.22;
}

async function normalizeSeasonStatuses(leagueId: string) {
  const seasons = await prisma.season.findMany({
    where: { leagueId },
    orderBy: { year: "desc" },
    select: {
      id: true,
      year: true,
      status: true,
      openedAt: true,
      createdAt: true,
    },
  });

  const activeSeason =
    seasons.filter((season) => season.status === "ACTIVE").sort((left, right) => right.year - left.year)[0] ??
    seasons[0] ??
    null;

  if (!activeSeason) {
    return null;
  }

  for (const season of seasons) {
    const nextStatus =
      season.id === activeSeason.id ? "ACTIVE" : season.year > activeSeason.year ? "PLANNED" : "COMPLETED";

    const patch: {
      status?: "PLANNED" | "ACTIVE" | "COMPLETED";
      openedAt?: Date;
    } = {};

    if (season.status !== nextStatus) {
      patch.status = nextStatus;
    }

    if (!season.openedAt && nextStatus === "ACTIVE") {
      patch.openedAt = season.createdAt;
    }

    if (Object.keys(patch).length > 0) {
      await prisma.season.update({
        where: { id: season.id },
        data: patch,
      });
    }
  }

  return activeSeason;
}

async function ensurePrimaryTeamMembership(userId: string, teamId: string) {
  await prisma.teamMembership.upsert({
    where: {
      teamId_userId_membershipType: {
        teamId,
        userId,
        membershipType: TeamMembershipType.PRIMARY_MANAGER,
      },
    },
    update: {
      isActive: true,
    },
    create: {
      teamId,
      userId,
      membershipType: TeamMembershipType.PRIMARY_MANAGER,
      isActive: true,
    },
  });
}

async function seedSeasonAwareTeamState(leagueId: string, seasonId: string) {
  const [teams, rosterSlots, contracts, capPenalties, existingAssignments] = await Promise.all([
    prisma.team.findMany({
      where: { leagueId },
      select: { id: true },
    }),
    prisma.rosterSlot.findMany({
      where: { seasonId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        teamId: true,
        playerId: true,
        slotType: true,
        createdAt: true,
      },
    }),
    prisma.contract.findMany({
      where: { seasonId },
      select: {
        id: true,
        teamId: true,
        playerId: true,
        salary: true,
      },
    }),
    prisma.capPenalty.findMany({
      where: { seasonId },
      select: {
        teamId: true,
        amount: true,
      },
    }),
    prisma.rosterAssignment.findMany({
      where: { seasonId, endedAt: null },
      select: {
        id: true,
        teamId: true,
        playerId: true,
      },
    }),
  ]);

  const activeAssignmentKeys = new Set(
    existingAssignments.map((assignment) => `${assignment.teamId}:${assignment.playerId}`),
  );
  const contractIdByTeamPlayer = new Map(
    contracts.map((contract) => [`${contract.teamId}:${contract.playerId}`, contract.id]),
  );

  for (const slot of rosterSlots) {
    const assignmentKey = `${slot.teamId}:${slot.playerId}`;
    if (activeAssignmentKeys.has(assignmentKey)) {
      continue;
    }

    await prisma.rosterAssignment.create({
      data: {
        teamId: slot.teamId,
        seasonId,
        playerId: slot.playerId,
        contractId: contractIdByTeamPlayer.get(assignmentKey) ?? null,
        acquisitionType: "MANUAL",
        rosterStatus: slot.slotType === "IR" ? "IR" : "ACTIVE",
        effectiveAt: slot.createdAt,
      },
    });
    activeAssignmentKeys.add(assignmentKey);
  }

  const assignmentsByTeam = new Map<string, number>();
  for (const key of activeAssignmentKeys) {
    const [teamId] = key.split(":");
    assignmentsByTeam.set(teamId, (assignmentsByTeam.get(teamId) ?? 0) + 1);
  }

  const salaryByTeam = new Map<string, number>();
  for (const contract of contracts) {
    salaryByTeam.set(contract.teamId, (salaryByTeam.get(contract.teamId) ?? 0) + contract.salary);
  }

  const deadCapByTeam = new Map<string, number>();
  for (const penalty of capPenalties) {
    deadCapByTeam.set(penalty.teamId, (deadCapByTeam.get(penalty.teamId) ?? 0) + penalty.amount);
  }

  const recalculatedAt = new Date();
  for (const team of teams) {
    const activeCapTotal = salaryByTeam.get(team.id) ?? 0;
    const deadCapTotal = deadCapByTeam.get(team.id) ?? 0;
    await prisma.teamSeasonState.upsert({
      where: {
        teamId_seasonId: {
          teamId: team.id,
          seasonId,
        },
      },
      update: {
        rosterCount: assignmentsByTeam.get(team.id) ?? 0,
        activeCapTotal,
        deadCapTotal,
        hardCapTotal: activeCapTotal + deadCapTotal,
        lastRecalculatedAt: recalculatedAt,
      },
      create: {
        teamId: team.id,
        seasonId,
        rosterCount: assignmentsByTeam.get(team.id) ?? 0,
        activeCapTotal,
        deadCapTotal,
        hardCapTotal: activeCapTotal + deadCapTotal,
        lastRecalculatedAt: recalculatedAt,
      },
    });
  }
}

async function seedLeagueCore() {
  let league = await prisma.league.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!league) {
    league = await prisma.league.create({
      data: {
        name: LEAGUE_NAME,
        description: "Local-first dynasty contract fantasy football league",
      },
    });
  } else if (league.name !== LEAGUE_NAME && !league.name.includes("Dynasty Contract Football")) {
    league = await prisma.league.update({
      where: { id: league.id },
      data: {
        name: LEAGUE_NAME,
      },
    });
  }

  const season = await prisma.season.upsert({
    where: {
      leagueId_year: {
        leagueId: league.id,
        year: INITIAL_SEASON_YEAR,
      },
    },
    update: {
      status: "ACTIVE",
    },
    create: {
      leagueId: league.id,
      year: INITIAL_SEASON_YEAR,
      status: "ACTIVE",
      phase: INITIAL_SEASON_PHASE,
      openedAt: new Date(),
      regularSeasonWeeks: 13,
      playoffStartWeek: 14,
      playoffEndWeek: 16,
    },
  });

  const existingRuleset = await prisma.leagueRuleSet.findFirst({
    where: {
      leagueId: league.id,
      version: 1,
    },
  });

  if (!existingRuleset) {
    await prisma.leagueRuleSet.create({
      data: {
        leagueId: league.id,
        version: 1,
        isActive: true,
        rosterSize: ROSTER_SIZE,
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
      },
    });
  }

  const activeSeason = await normalizeSeasonStatuses(league.id);
  if (activeSeason) {
    for (const deadline of getDefaultLifecycleDeadlines(activeSeason.year)) {
      const existingDeadline = await prisma.leagueDeadline.findFirst({
        where: {
          leagueId: league.id,
          seasonId: activeSeason.id,
          phase: deadline.phase,
          deadlineType: deadline.deadlineType,
        },
        select: {
          id: true,
        },
      });

      if (!existingDeadline) {
        await prisma.leagueDeadline.create({
          data: {
            leagueId: league.id,
            seasonId: activeSeason.id,
            ...deadline,
          },
        });
      }
    }
  }

  for (const [index, blueprint] of TEAM_BLUEPRINTS.entries()) {
    const ownerEmail = `owner${String(index + 1).padStart(2, "0")}@local.league`;
    const ownerUser = await prisma.user.upsert({
      where: { email: ownerEmail },
      update: {
        name: blueprint.ownerName,
        platformRole: PlatformRole.USER,
      },
      create: {
        email: ownerEmail,
        name: blueprint.ownerName,
        platformRole: PlatformRole.USER,
      },
    });

    let owner = await prisma.owner.findFirst({
      where: { name: blueprint.ownerName },
    });

    if (!owner) {
      owner = await prisma.owner.create({
        data: {
          name: blueprint.ownerName,
          email: ownerEmail,
          userId: ownerUser.id,
        },
      });
    } else if (owner.userId !== ownerUser.id || owner.email !== ownerEmail) {
      owner = await prisma.owner.update({
        where: { id: owner.id },
        data: {
          email: ownerEmail,
          userId: ownerUser.id,
        },
      });
    }

    const existingTeam = await prisma.team.findFirst({
      where: {
        leagueId: league.id,
        name: blueprint.name,
      },
    });

    const team = !existingTeam
      ? await prisma.team.create({
          data: {
            leagueId: league.id,
            ownerId: owner.id,
            name: blueprint.name,
            abbreviation: blueprint.abbreviation,
            divisionLabel: index < TEAM_COUNT / 2 ? "North" : "South",
          },
        })
      : await prisma.team.update({
          where: { id: existingTeam.id },
          data: {
            ownerId: owner.id,
            abbreviation: blueprint.abbreviation,
            divisionLabel: index < TEAM_COUNT / 2 ? "North" : "South",
          },
        });

    await prisma.leagueMembership.upsert({
      where: {
        userId_leagueId: {
          userId: ownerUser.id,
          leagueId: league.id,
        },
      },
      update: {
        role: LeagueRole.MEMBER,
        teamId: team.id,
      },
      create: {
        userId: ownerUser.id,
        leagueId: league.id,
        role: LeagueRole.MEMBER,
        teamId: team.id,
      },
    });
    await ensurePrimaryTeamMembership(ownerUser.id, team.id);
  }

  const commissioner = await prisma.user.upsert({
    where: { email: COMMISSIONER_EMAIL },
    update: {
      name: COMMISSIONER_NAME,
      platformRole: PlatformRole.USER,
    },
    create: {
      email: COMMISSIONER_EMAIL,
      name: COMMISSIONER_NAME,
      platformRole: PlatformRole.USER,
    },
  });

  await prisma.leagueMembership.upsert({
    where: {
      userId_leagueId: {
        userId: commissioner.id,
        leagueId: league.id,
      },
    },
    update: {
      role: LeagueRole.COMMISSIONER,
      teamId: null,
    },
    create: {
      userId: commissioner.id,
      leagueId: league.id,
      role: LeagueRole.COMMISSIONER,
      teamId: null,
    },
  });

  const readOnlyUser = await prisma.user.upsert({
    where: { email: READ_ONLY_EMAIL },
    update: {
      name: READ_ONLY_NAME,
      platformRole: PlatformRole.USER,
    },
    create: {
      email: READ_ONLY_EMAIL,
      name: READ_ONLY_NAME,
      platformRole: PlatformRole.USER,
    },
  });

  await prisma.leagueMembership.upsert({
    where: {
      userId_leagueId: {
        userId: readOnlyUser.id,
        leagueId: league.id,
      },
    },
    update: {
      role: LeagueRole.MEMBER,
      teamId: null,
    },
    create: {
      userId: readOnlyUser.id,
      leagueId: league.id,
      role: LeagueRole.MEMBER,
      teamId: null,
    },
  });

  await prisma.user.upsert({
    where: {
      email: PLATFORM_ADMIN_EMAIL,
    },
    update: {
      name: PLATFORM_ADMIN_NAME,
      platformRole: PlatformRole.ADMIN,
    },
    create: {
      email: PLATFORM_ADMIN_EMAIL,
      name: PLATFORM_ADMIN_NAME,
      platformRole: PlatformRole.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: {
      email: NO_LEAGUE_USER_EMAIL,
    },
    update: {
      name: NO_LEAGUE_USER_NAME,
      platformRole: PlatformRole.USER,
    },
    create: {
      email: NO_LEAGUE_USER_EMAIL,
      name: NO_LEAGUE_USER_NAME,
      platformRole: PlatformRole.USER,
    },
  });

  // Smoke test members — pre-existing users that full-journey tests invite via API.
  // These users have no league memberships in the seed; they join fresh leagues created
  // during the test run by accepting API-issued invites.
  for (let i = 1; i <= 10; i++) {
    const paddedIndex = String(i).padStart(2, "0");
    await prisma.user.upsert({
      where: { email: `smoke-member-${paddedIndex}@local.league` },
      update: { name: `Smoke Member ${paddedIndex}`, platformRole: PlatformRole.USER },
      create: {
        email: `smoke-member-${paddedIndex}@local.league`,
        name: `Smoke Member ${paddedIndex}`,
        platformRole: PlatformRole.USER,
      },
    });
  }

  return { leagueId: league.id, seasonId: season.id };
}

function formatPlayerPoolSummary(
  provider: {
    id: string;
    version: number;
  },
  players: Array<{
    position: Position;
    nflTeam: string | null;
  }>,
) {
  const positionBreakdown = PLAYER_POSITION_ORDER.map((position) => {
    const total = players.filter((player) => player.position === position).length;
    return `${position}:${total}`;
  }).join("; ");

  const nflTeamCount = new Set(
    players
      .map((player) => player.nflTeam)
      .filter((team): team is string => Boolean(team)),
  ).size;
  const freeAgents = players.filter((player) => player.nflTeam === null).length;

  return `[seed] Player pool summary ${provider.id} v${provider.version}: total=${players.length}; positions=(${positionBreakdown}); nflTeams=${nflTeamCount}; freeAgents=${freeAgents}`;
}

async function countPlayerLinkedActivity() {
  const [rosterSlots, contracts, draftedSelections, tradeAssets, transactions] = await Promise.all([
    prisma.rosterSlot.count(),
    prisma.contract.count(),
    prisma.draftSelection.count({
      where: {
        playerId: {
          not: null,
        },
      },
    }),
    prisma.tradeAsset.count({
      where: {
        playerId: {
          not: null,
        },
      },
    }),
    prisma.transaction.count({
      where: {
        playerId: {
          not: null,
        },
      },
    }),
  ]);

  return {
    rosterSlots,
    contracts,
    draftedSelections,
    tradeAssets,
    transactions,
    total:
      rosterSlots +
      contracts +
      draftedSelections +
      tradeAssets +
      transactions,
  };
}

async function seedPlayers() {
  const provider = createFantasyProsSeedProvider();
  const markerPrefix = `${provider.id}-v${provider.version}-`;
  const generatedPool = await provider.loadPlayers();
  if (generatedPool.length === 0) {
    throw new Error("Player seed provider returned zero players.");
  }

  const duplicateExternalIds = generatedPool.reduce<string[]>((duplicates, player, index, players) => {
    if (!player.externalId) {
      return duplicates;
    }

    if (players.findIndex((candidate) => candidate.externalId === player.externalId) !== index) {
      duplicates.push(player.externalId);
    }
    return duplicates;
  }, []);

  if (duplicateExternalIds.length > 0) {
    throw new Error(`Player seed provider returned duplicate externalIds: ${duplicateExternalIds.join(", ")}`);
  }

  console.log(`[seed] Player provider: ${provider.id} v${provider.version}.`);

  const existingVersionCount = await prisma.player.count({
    where: {
      externalId: {
        startsWith: markerPrefix,
      },
    },
  });

  if (existingVersionCount > 0) {
    const existingVersionPlayers = await prisma.player.findMany({
      where: {
        externalId: {
          startsWith: markerPrefix,
        },
      },
      select: {
        position: true,
        nflTeam: true,
      },
    });

    console.log(`[seed] Player pool ${provider.id} v${provider.version} already seeded; no-op.`);
    console.log(formatPlayerPoolSummary(provider, existingVersionPlayers));
    return;
  }

  const existingPlayers = await prisma.player.count();
  if (existingPlayers > 0) {
    const legacyCanonicalPlayers = await prisma.player.count({
      where: {
        externalId: {
          startsWith: LEGACY_CANONICAL_PLAYER_PREFIX,
        },
      },
    });

    if (legacyCanonicalPlayers === existingPlayers) {
      const activity = await countPlayerLinkedActivity();
      if (activity.total > 0) {
        throw new Error(
          `Legacy canonical player pool detected with dependent league activity (rosterSlots=${activity.rosterSlots}, contracts=${activity.contracts}, draftSelections=${activity.draftedSelections}, tradeAssets=${activity.tradeAssets}, transactions=${activity.transactions}). Run \`npm run db:reset\` to rebuild with the FantasyPros player pool.`,
        );
      }

      await prisma.player.deleteMany({
        where: {
          externalId: {
            startsWith: LEGACY_CANONICAL_PLAYER_PREFIX,
          },
        },
      });

      console.log("[seed] Removed legacy canonical player pool and replacing it with the FantasyPros player pool.");
    } else {
      console.log(
        `[seed] Player table already has ${existingPlayers} records without ${provider.id} v${provider.version} markers; skipping player seed.`,
      );
      console.log("[seed] Run `npm run db:reset` to regenerate the FantasyPros player pool.");
      return;
    }
  }

  await prisma.player.createMany({
    data: generatedPool.map((player) => ({
      sourceKey: player.sourceKey,
      sourcePlayerId: player.sourcePlayerId,
      externalId: player.externalId,
      name: player.name,
      displayName: player.displayName ?? player.name,
      searchName: normalizePlayerSearchName(player.displayName ?? player.name),
      position: player.position,
      nflTeam: player.nflTeam,
      age: player.age,
      yearsPro: player.yearsPro,
      injuryStatus: player.injuryStatus ?? null,
      statusCode: player.statusCode ?? null,
      statusText: player.statusText ?? null,
      isRestricted: player.isRestricted ?? false,
    })),
  });

  const insertedPlayers = await prisma.player.findMany({
    where: {
      externalId: {
        startsWith: markerPrefix,
      },
    },
    select: {
      position: true,
      nflTeam: true,
    },
  });

  console.log(`[seed] Player pool ${provider.id} v${provider.version} created with ${generatedPool.length} players.`);
  console.log(formatPlayerPoolSummary(provider, insertedPlayers));
}

async function seedRosterContractsAndPicks(leagueId: string, seasonId: string) {
  const existingRosters = await prisma.rosterSlot.count({
    where: { seasonId },
  });

  const teams = await prisma.team.findMany({
    where: { leagueId },
    orderBy: { abbreviation: "asc" },
  });

  if (existingRosters === 0) {
    const players = await prisma.player.findMany({
      where: {
        OR: [
          {
            yearsPro: null,
          },
          {
            yearsPro: {
              not: 0,
            },
          },
        ],
      },
      orderBy: { externalId: "asc" },
    });
    const random = createSeededRandom(SEEDED_RANDOM_SEED);

    const minimumPlayersRequired = teams.length * ROSTER_SIZE;
    if (players.length < minimumPlayersRequired) {
      throw new Error(
        `Not enough players to seed rosters. Required ${minimumPlayersRequired}, found ${players.length}.`,
      );
    }

    const rosterTemplate = buildRosterTemplate();
    const rosterRows: {
      seasonId: string;
      teamId: string;
      playerId: string;
      slotType: TeamSlotType;
      slotLabel: string;
    }[] = [];
    const contractRows: {
      seasonId: string;
      teamId: string;
      playerId: string;
      salary: number;
      yearsTotal: number;
      yearsRemaining: number;
      startYear: number;
      endYear: number;
      isRookieContract: boolean;
      rookieOptionEligible: boolean;
      rookieOptionExercised: boolean;
      isFranchiseTag: boolean;
    }[] = [];
    const overallRankByPlayerId = new Map(players.map((player, index) => [player.id, index + 1]));

    const playersByPosition: Record<Position, typeof players> = {
      QB: shuffleInPlace(
        players.filter((player) => player.position === "QB"),
        random,
      ),
      RB: shuffleInPlace(
        players.filter((player) => player.position === "RB"),
        random,
      ),
      WR: shuffleInPlace(
        players.filter((player) => player.position === "WR"),
        random,
      ),
      TE: shuffleInPlace(
        players.filter((player) => player.position === "TE"),
        random,
      ),
      K: shuffleInPlace(
        players.filter((player) => player.position === "K"),
        random,
      ),
      DST: shuffleInPlace(
        players.filter((player) => player.position === "DST"),
        random,
      ),
    };

    const positionIndexes: Record<Position, number> = {
      QB: 0,
      RB: 0,
      WR: 0,
      TE: 0,
      K: 0,
      DST: 0,
    };

    const usedPlayerIds = new Set<string>();
    const fallbackPlayers = shuffleInPlace([...players], random);
    let globalFallbackIndex = 0;

    const starterPositionHints: Record<string, Position[]> = {
      QB: ["QB"],
      QB_FLEX: ["QB", "RB", "WR", "TE"],
      RB1: ["RB"],
      RB2: ["RB"],
      WR1: ["WR"],
      WR2: ["WR"],
      WR3: ["WR"],
      TE: ["TE"],
      FLEX: ["RB", "WR", "TE"],
      DST: ["DST"],
    };

    const benchRotation: Position[] = ["RB", "WR", "TE", "K", "QB", "RB", "WR", "DST"];
    let benchRotationIndex = 0;

    function pullNextPlayer(preferredPositions: Position[]): (typeof players)[number] {
      for (const position of preferredPositions) {
        const pool = playersByPosition[position];
        let index = positionIndexes[position];

        while (index < pool.length && usedPlayerIds.has(pool[index].id)) {
          index += 1;
        }

        if (index < pool.length) {
          positionIndexes[position] = index + 1;
          const picked = pool[index];
          usedPlayerIds.add(picked.id);
          return picked;
        }
      }

      while (globalFallbackIndex < fallbackPlayers.length) {
        const fallback = fallbackPlayers[globalFallbackIndex];
        globalFallbackIndex += 1;
        if (!usedPlayerIds.has(fallback.id)) {
          usedPlayerIds.add(fallback.id);
          return fallback;
        }
      }

      throw new Error("Not enough players available to complete seeded rosters.");
    }
    for (const team of teams) {
      for (let slotIndex = 0; slotIndex < ROSTER_SIZE; slotIndex += 1) {
        const slot = rosterTemplate[slotIndex];
        const preferredPositions: Position[] =
          slot.slotType === "STARTER"
            ? starterPositionHints[slot.slotLabel] ?? ["RB", "WR", "TE", "K", "QB", "DST"]
            : [benchRotation[benchRotationIndex % benchRotation.length], "RB", "WR", "TE", "K", "QB", "DST"];

        const player = pullNextPlayer(preferredPositions);
        if (slot.slotType !== "STARTER") {
          benchRotationIndex += 1;
        }

        const overallRank = overallRankByPlayerId.get(player.id) ?? players.length;
        const salary = determineSeedSalary(player, overallRank, players.length, random);
        const yearsTotal = determineContractYears(salary, random);
        const startYear = INITIAL_SEASON_YEAR;
        const endYear = startYear + yearsTotal - 1;
        const isRookie = determineRookieFlag(player, overallRank, salary, random);

        rosterRows.push({
          seasonId,
          teamId: team.id,
          playerId: player.id,
          slotType: slot.slotType,
          slotLabel: slot.slotLabel,
        });

        contractRows.push({
          seasonId,
          teamId: team.id,
          playerId: player.id,
          salary,
          yearsTotal,
          yearsRemaining: yearsTotal,
          startYear,
          endYear,
          isRookieContract: isRookie,
          rookieOptionEligible: isRookie,
          rookieOptionExercised: false,
          isFranchiseTag: false,
        });
      }
    }

    await prisma.rosterSlot.createMany({
      data: rosterRows,
    });

    await prisma.contract.createMany({
      data: contractRows,
    });
  }

  const existingPicks = await prisma.futurePick.findMany({
    where: {
      leagueId,
      seasonYear: {
        gte: FUTURE_PICK_START_YEAR,
        lte: FUTURE_PICK_END_YEAR,
      },
    },
    select: {
      seasonYear: true,
      round: true,
      originalTeamId: true,
    },
  });
  const existingPickKeys = new Set(
    existingPicks.map((pick) => `${pick.seasonYear}:${pick.round}:${pick.originalTeamId}`),
  );

  const pickRows: {
    leagueId: string;
    seasonYear: number;
    round: number;
    overall: number;
    originalTeamId: string;
    currentTeamId: string;
    isUsed: boolean;
  }[] = [];

  for (let seasonYear = FUTURE_PICK_START_YEAR; seasonYear <= FUTURE_PICK_END_YEAR; seasonYear += 1) {
    for (let round = 1; round <= 2; round += 1) {
      teams.forEach((team, index) => {
        const pickKey = `${seasonYear}:${round}:${team.id}`;
        if (existingPickKeys.has(pickKey)) {
          return;
        }

        pickRows.push({
          leagueId,
          seasonYear,
          round,
          overall: (round - 1) * teams.length + index + 1,
          originalTeamId: team.id,
          currentTeamId: team.id,
          isUsed: false,
        });
      });
    }
  }

  if (pickRows.length > 0) {
    await prisma.futurePick.createMany({
      data: pickRows,
    });
  }
}

async function main() {
  const { leagueId, seasonId } = await seedLeagueCore();
  await seedPlayers();
  await seedRosterContractsAndPicks(leagueId, seasonId);
  await seedSeasonAwareTeamState(leagueId, seasonId);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed complete.");
  })
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
