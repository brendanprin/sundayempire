import { PrismaClient, SeasonStatus } from "@prisma/client";
import { getDefaultLifecycleDeadlines } from "../src/lib/domain/lifecycle/default-deadlines";

const prisma = new PrismaClient();

async function seedActiveSeasonDeadlines(leagueId: string, seasonId: string, seasonYear: number) {
  for (const deadline of getDefaultLifecycleDeadlines(seasonYear)) {
    const existing = await prisma.leagueDeadline.findFirst({
      where: {
        leagueId,
        seasonId,
        phase: deadline.phase,
        deadlineType: deadline.deadlineType,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      await prisma.leagueDeadline.create({
        data: {
          leagueId,
          seasonId,
          ...deadline,
        },
      });
    }
  }
}

async function main() {
  await prisma.$executeRawUnsafe(`
    UPDATE "Season"
    SET "phase" = CASE "phase"
      WHEN 'PRESEASON' THEN 'PRESEASON_SETUP'
      WHEN 'REGULAR_SEASON' THEN 'REGULAR_SEASON'
      WHEN 'PLAYOFFS' THEN 'PLAYOFFS'
      WHEN 'OFFSEASON' THEN 'OFFSEASON_ROLLOVER'
      ELSE "phase"
    END
  `);

  const leagues = await prisma.league.findMany({
    select: {
      id: true,
      seasons: {
        orderBy: { year: "desc" },
        select: {
          id: true,
          year: true,
          status: true,
          openedAt: true,
          closedAt: true,
          sourceSeasonId: true,
          createdAt: true,
        },
      },
    },
  });

  for (const league of leagues) {
    const activeSeasons = league.seasons.filter((season) => season.status === "ACTIVE");
    const inferredActiveSeasonId =
      activeSeasons.sort((left, right) => right.year - left.year)[0]?.id ?? league.seasons[0]?.id ?? null;

    for (const season of league.seasons) {
      const patch: {
        status?: SeasonStatus;
        openedAt?: Date;
      } = {};

      if (!season.openedAt) {
        patch.openedAt = season.createdAt;
      }

      if (inferredActiveSeasonId) {
        const activeSeason = league.seasons.find((entry) => entry.id === inferredActiveSeasonId) ?? null;
        if (activeSeason) {
          patch.status =
            season.id === activeSeason.id ? "ACTIVE" : season.year > activeSeason.year ? "PLANNED" : "COMPLETED";
        }
      }

      if (Object.keys(patch).length > 0) {
        await prisma.season.update({
          where: { id: season.id },
          data: patch,
        });
      }
    }

    if (inferredActiveSeasonId) {
      const activeSeason = league.seasons.find((season) => season.id === inferredActiveSeasonId);
      if (activeSeason) {
        await seedActiveSeasonDeadlines(league.id, activeSeason.id, activeSeason.year);
      }
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
