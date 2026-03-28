import { Prisma, PrismaClient } from "@prisma/client";
import type { AuthActor } from "@/lib/auth";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";
import { createTradeProposalRepository } from "@/lib/repositories/trades/trade-proposal-repository";
import { mapTradeAssetView } from "@/lib/read-models/trades/shared";
import type { TradeBuilderContextResponse } from "@/types/trade-workflow";

type TradesReadDbClient = PrismaClient | Prisma.TransactionClient;

function pickLabel(input: {
  seasonYear: number;
  round: number;
  overall: number | null;
  originalTeamName: string;
  originalTeamAbbreviation: string | null;
}) {
  const original = input.originalTeamAbbreviation?.trim() || input.originalTeamName;
  return `${input.seasonYear} R${input.round}${input.overall ? ` (#${input.overall})` : ""} from ${original}`;
}

export function createTradeBuilderProjection(client: TradesReadDbClient = prisma) {
  const proposalRepository = createTradeProposalRepository(client);

  return {
    async read(input: {
      leagueId: string;
      seasonId: string;
      seasonYear: number;
      seasonPhase: string;
      leagueName: string;
      actor: AuthActor;
      proposalId?: string | null;
    }): Promise<TradeBuilderContextResponse> {
      const [teams, contracts, picks, proposal] = await Promise.all([
        client.team.findMany({
          where: {
            leagueId: input.leagueId,
          },
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
          orderBy: {
            name: "asc",
          },
        }),
        client.contract.findMany({
          where: {
            seasonId: input.seasonId,
            status: {
              in: [...ACTIVE_CONTRACT_STATUSES],
            },
          },
          include: {
            player: {
              select: {
                id: true,
                name: true,
                position: true,
                isRestricted: true,
              },
            },
          },
          orderBy: [{ teamId: "asc" }, { salary: "desc" }, { createdAt: "asc" }],
        }),
        client.futurePick.findMany({
          where: {
            leagueId: input.leagueId,
            seasonYear: {
              gte: input.seasonYear,
              lte: input.seasonYear + 2,
            },
            isUsed: false,
          },
          include: {
            originalTeam: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
          },
          orderBy: [{ currentTeamId: "asc" }, { seasonYear: "asc" }, { round: "asc" }, { overall: "asc" }],
        }),
        input.proposalId ? proposalRepository.findById(input.proposalId) : Promise.resolve(null),
      ]);

      if (
        proposal &&
        (proposal.leagueId !== input.leagueId || proposal.seasonId !== input.seasonId)
      ) {
        throw new Error("FORBIDDEN");
      }

      if (proposal && proposal.status !== "DRAFT") {
        throw new Error("TRADE_STATE_CONFLICT");
      }

      if (
        proposal &&
        input.actor.leagueRole === "MEMBER" &&
        input.actor.teamId !== proposal.proposerTeamId
      ) {
        throw new Error("FORBIDDEN");
      }

      if (input.actor.leagueRole === "MEMBER" && !input.actor.teamId) {
        throw new Error("FORBIDDEN");
      }

      const assetPools = teams.map((team) => ({
        team,
        players: contracts
          .filter((contract) => contract.teamId === team.id)
          .map((contract) => ({
            playerId: contract.playerId,
            contractId: contract.id,
            label: `${contract.player.name} (${contract.player.position})`,
            name: contract.player.name,
            position: contract.player.position,
            salary: contract.salary,
            yearsRemaining: contract.yearsRemaining,
            status: contract.status,
            isFranchiseTag: contract.isFranchiseTag,
            isRestricted: contract.player.isRestricted,
          })),
        picks: picks
          .filter((pick) => pick.currentTeamId === team.id)
          .map((pick) => ({
            id: pick.id,
            label: pickLabel({
              seasonYear: pick.seasonYear,
              round: pick.round,
              overall: pick.overall,
              originalTeamName: pick.originalTeam.name,
              originalTeamAbbreviation: pick.originalTeam.abbreviation,
            }),
            seasonYear: pick.seasonYear,
            round: pick.round,
            overall: pick.overall,
            originalTeam: {
              id: pick.originalTeam.id,
              name: pick.originalTeam.name,
              abbreviation: pick.originalTeam.abbreviation,
            },
          })),
        availability: {
          picksAvailable: picks.some((pick) => pick.currentTeamId === team.id),
          pickDataIncomplete: false,
        },
      }));

      return {
        viewer: {
          leagueRole: input.actor.leagueRole,
          hasTeamAccess: Boolean(input.actor.teamId),
          teamId: input.actor.teamId,
          teamName: input.actor.teamName,
        },
        league: {
          id: input.leagueId,
          name: input.leagueName,
        },
        season: {
          id: input.seasonId,
          year: input.seasonYear,
          phase: input.seasonPhase,
        },
        teams,
        assetPools,
        proposalDraft: proposal
          ? {
              id: proposal.id,
              status: proposal.status,
              proposerTeam: {
                id: proposal.proposerTeam.id,
                name: proposal.proposerTeam.name,
                abbreviation: proposal.proposerTeam.abbreviation,
              },
              counterpartyTeam: {
                id: proposal.counterpartyTeam.id,
                name: proposal.counterpartyTeam.name,
                abbreviation: proposal.counterpartyTeam.abbreviation,
              },
              createdAt: proposal.createdAt.toISOString(),
              updatedAt: proposal.updatedAt.toISOString(),
              submittedAt: proposal.submittedAt?.toISOString() ?? null,
              counterpartyRespondedAt:
                proposal.counterpartyRespondedAt?.toISOString() ?? null,
              reviewedAt: proposal.reviewedAt?.toISOString() ?? null,
              assets: proposal.assets.map(mapTradeAssetView),
            }
          : null,
      };
    },
  };
}
