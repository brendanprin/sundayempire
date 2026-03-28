import type { AuctionPoolExclusionReason, AuctionSessionMode, Position } from "@prisma/client";
import {
  buildFantasyProsDraftRankingLookup,
  fantasyProsDraftRankingLookupKey,
} from "@/lib/fantasypros-draft-rankings";
import type { AuctionDbClient } from "@/lib/domain/auction/shared";
import { prisma } from "@/lib/prisma";

const rankingLookup = buildFantasyProsDraftRankingLookup();

type TeamSummary = {
  id: string;
  name: string;
  abbreviation: string | null;
} | null;

export type AuctionEligiblePlayerRecord = {
  id: string;
  name: string;
  displayName: string;
  position: Position;
  nflTeam: string | null;
  age: number | null;
  yearsPro: number | null;
  injuryStatus: string | null;
  isRestricted: boolean;
  isRostered: boolean;
  ownerTeam: TeamSummary;
  draftRank: number | null;
  draftTier: number | null;
};

export type AuctionExcludedPlayerRecord = AuctionEligiblePlayerRecord & {
  primaryExclusionReason: AuctionPoolExclusionReason;
  exclusionReasons: AuctionPoolExclusionReason[];
};

function rankingForPlayer(player: {
  name: string;
  nflTeam: string | null;
  position: Position;
}) {
  return (
    rankingLookup.get(
      fantasyProsDraftRankingLookupKey({
        name: player.name,
        nflTeam: player.nflTeam,
        position: player.position,
      }),
    ) ?? null
  );
}

function sortByRankThenName<T extends { draftRank: number | null; name: string }>(
  left: T,
  right: T,
) {
  const leftRank = left.draftRank ?? Number.POSITIVE_INFINITY;
  const rightRank = right.draftRank ?? Number.POSITIVE_INFINITY;
  if (leftRank !== rightRank) {
    return leftRank - rightRank;
  }

  return left.name.localeCompare(right.name);
}

function pickPrimaryExclusionReason(
  reasons: AuctionPoolExclusionReason[],
): AuctionPoolExclusionReason {
  const priority: AuctionPoolExclusionReason[] = [
    "ALREADY_AWARDED",
    "ACTIVE_CONTRACT",
    "ROSTERED",
    "RESTRICTED",
    "EMERGENCY_POOL_LIMIT",
    "NOT_REQUESTED_FOR_EMERGENCY_FILL_IN",
  ];

  return priority.find((reason) => reasons.includes(reason)) ?? reasons[0]!;
}

export function createAuctionEligiblePlayersReader(client: AuctionDbClient = prisma) {
  return {
    async list(input: {
      seasonId: string;
      search?: string | null;
      auctionMode?: AuctionSessionMode;
      selectedPlayerIds?: string[];
    }): Promise<{
      eligible: AuctionEligiblePlayerRecord[];
      excluded: AuctionExcludedPlayerRecord[];
    }> {
      const search = input.search?.trim() ?? "";
      const selectedPlayerIds =
        input.auctionMode === "EMERGENCY_FILL_IN"
          ? new Set(input.selectedPlayerIds ?? [])
          : null;

      const [players, awards] = await Promise.all([
        client.player.findMany({
          where: search
            ? {
                name: {
                  contains: search,
                },
              }
            : undefined,
          include: {
            rosterSlots: {
              where: {
                seasonId: input.seasonId,
              },
              select: {
                id: true,
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
            contracts: {
              where: {
                seasonId: input.seasonId,
                status: {
                  in: ["ACTIVE", "EXPIRING", "TAGGED"],
                },
              },
              select: {
                id: true,
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
        }),
        client.auctionAward.findMany({
          where: {
            seasonId: input.seasonId,
            status: "FINALIZED",
          },
          select: {
            playerId: true,
          },
        }),
      ]);

      const awardedPlayerIds = new Set(awards.map((award) => award.playerId));
      const eligible: AuctionEligiblePlayerRecord[] = [];
      const excluded: AuctionExcludedPlayerRecord[] = [];

      for (const player of players) {
        const ownerTeam = player.contracts[0]?.team ?? player.rosterSlots[0]?.team ?? null;
        const ranking = rankingForPlayer(player);
        const hasActiveContract = player.contracts.length > 0;
        const isRostered = hasActiveContract || player.rosterSlots.length > 0;
        const exclusionReasons: AuctionPoolExclusionReason[] = [];

        if (awardedPlayerIds.has(player.id)) {
          exclusionReasons.push("ALREADY_AWARDED");
        }

        if (hasActiveContract) {
          exclusionReasons.push("ACTIVE_CONTRACT");
        } else if (player.rosterSlots.length > 0) {
          exclusionReasons.push("ROSTERED");
        }

        if (player.isRestricted) {
          exclusionReasons.push("RESTRICTED");
        }

        if (
          selectedPlayerIds &&
          selectedPlayerIds.size > 0 &&
          !selectedPlayerIds.has(player.id)
        ) {
          exclusionReasons.push("NOT_REQUESTED_FOR_EMERGENCY_FILL_IN");
        }

        const record: AuctionEligiblePlayerRecord = {
          id: player.id,
          name: player.name,
          displayName: player.displayName,
          position: player.position,
          nflTeam: player.nflTeam,
          age: player.age,
          yearsPro: player.yearsPro,
          injuryStatus: player.injuryStatus,
          isRestricted: player.isRestricted,
          isRostered,
          ownerTeam,
          draftRank: ranking?.overallRank ?? null,
          draftTier: ranking?.tier ?? null,
        };

        if (exclusionReasons.length === 0) {
          eligible.push(record);
          continue;
        }

        excluded.push({
          ...record,
          primaryExclusionReason: pickPrimaryExclusionReason(exclusionReasons),
          exclusionReasons,
        });
      }

      return {
        eligible: [...eligible].sort(sortByRankThenName),
        excluded: [...excluded].sort(sortByRankThenName),
      };
    },
  };
}
