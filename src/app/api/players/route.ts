import { NextRequest, NextResponse } from "next/server";
import { Position } from "@prisma/client";
import { apiError } from "@/lib/api";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { getActiveLeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import { parseBooleanParam } from "@/lib/request";

const SORTABLE_FIELDS = new Set(["name", "age", "salary", "yearsRemaining"]);

type PlayerRow = {
  id: string;
  name: string;
  position: Position;
  nflTeam: string | null;
  age: number | null;
  yearsPro: number | null;
  injuryStatus: string | null;
  isRestricted: boolean;
  contract: {
    id: string;
    salary: number;
    yearsRemaining: number;
  } | null;
  ownerTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  isRostered: boolean;
};

export async function GET(request: NextRequest) {
  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const params = request.nextUrl.searchParams;
  const search = params.get("search")?.trim() ?? "";
  const position = params.get("position");
  const nflTeam = params.get("nflTeam");
  const isRestricted = parseBooleanParam(params.get("isRestricted"));
  const rostered = parseBooleanParam(params.get("rostered"));
  const sortBy = params.get("sortBy") ?? "name";
  const sortDir = params.get("sortDir") === "desc" ? "desc" : "asc";

  const where = {
    ...(search
      ? {
          name: {
            contains: search,
          },
        }
      : {}),
    ...(position && ["QB", "RB", "WR", "TE", "K", "DST"].includes(position)
      ? {
          position: position as Position,
        }
      : {}),
    ...(nflTeam
      ? {
          nflTeam: {
            equals: nflTeam,
          },
        }
      : {}),
    ...(typeof isRestricted === "boolean"
      ? {
          isRestricted,
        }
      : {}),
    ...(typeof rostered === "boolean"
      ? rostered
        ? {
            rosterSlots: {
              some: {
                seasonId: context.seasonId,
              },
            },
          }
        : {
            rosterSlots: {
              none: {
                seasonId: context.seasonId,
              },
            },
          }
      : {}),
  };

  const players = await prisma.player.findMany({
    where,
    include: {
      contracts: {
        where: {
          seasonId: context.seasonId,
          status: {
            in: [...ACTIVE_CONTRACT_STATUSES],
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
      rosterSlots: {
        where: {
          seasonId: context.seasonId,
        },
        include: {
          team: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
        take: 1,
      },
    },
    orderBy: {
      name: "asc",
    },
  });

  let mapped: PlayerRow[] = players.map((player) => {
    const currentContract = player.contracts[0] ?? null;
    const rosterSlot = player.rosterSlots[0] ?? null;

    return {
      id: player.id,
      name: player.name,
      position: player.position,
      nflTeam: player.nflTeam,
      age: player.age,
      yearsPro: player.yearsPro,
      injuryStatus: player.injuryStatus,
      isRestricted: player.isRestricted,
      contract: currentContract
        ? {
            id: currentContract.id,
            salary: currentContract.salary,
            yearsRemaining: currentContract.yearsRemaining,
          }
        : null,
      ownerTeam: rosterSlot?.team ?? null,
      isRostered: Boolean(rosterSlot),
    };
  });

  if (SORTABLE_FIELDS.has(sortBy)) {
    mapped = mapped.sort((a, b) => {
      const getValue = (row: PlayerRow) => {
        if (sortBy === "salary") {
          return row.contract?.salary ?? -1;
        }
        if (sortBy === "yearsRemaining") {
          return row.contract?.yearsRemaining ?? -1;
        }
        if (sortBy === "age") {
          return row.age ?? -1;
        }
        return row.name.toLowerCase();
      };

      const left = getValue(a);
      const right = getValue(b);

      if (left < right) {
        return sortDir === "asc" ? -1 : 1;
      }
      if (left > right) {
        return sortDir === "asc" ? 1 : -1;
      }
      return 0;
    });
  }

  return NextResponse.json({
    league: {
      id: context.leagueId,
      name: context.leagueName,
    },
    season: {
      id: context.seasonId,
      year: context.seasonYear,
    },
    players: mapped,
    meta: {
      count: mapped.length,
    },
  });
}
