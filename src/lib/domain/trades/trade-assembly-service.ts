import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import type { ContractDbClient } from "@/lib/domain/contracts/shared";
import type { TradeAssetWriteInput } from "@/lib/repositories/trades/types";
import type { TradeAssetSelectionInput } from "@/types/trade-workflow";
import type { PreparedTradePackage, TradePackageInput } from "@/lib/domain/trades/types";
import { prisma } from "@/lib/prisma";

function normalizeAssetSelections(raw: TradeAssetSelectionInput[]) {
  if (!Array.isArray(raw)) {
    throw new Error("INVALID_REQUEST");
  }

  return raw;
}

function buildPickLabel(input: {
  seasonYear: number;
  round: number;
  overall: number | null;
  originalTeamName: string;
  originalTeamAbbreviation: string | null;
}) {
  const original = input.originalTeamAbbreviation?.trim() || input.originalTeamName;
  return `${input.seasonYear} R${input.round}${input.overall ? ` (#${input.overall})` : ""} from ${original}`;
}

export function createTradeAssemblyService(client: ContractDbClient = prisma) {
  return {
    async prepareTradePackage(input: TradePackageInput): Promise<PreparedTradePackage> {
      const proposerAssets = normalizeAssetSelections(input.proposerAssets);
      const counterpartyAssets = normalizeAssetSelections(input.counterpartyAssets);

      if (input.proposerTeamId === input.counterpartyTeamId) {
        throw new Error("INVALID_REQUEST");
      }

      const teams = await client.team.findMany({
        where: {
          leagueId: input.leagueId,
          id: {
            in: [input.proposerTeamId, input.counterpartyTeamId],
          },
        },
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      });

      const proposerTeam = teams.find((team) => team.id === input.proposerTeamId) ?? null;
      const counterpartyTeam = teams.find((team) => team.id === input.counterpartyTeamId) ?? null;
      if (!proposerTeam || !counterpartyTeam) {
        throw new Error("TEAM_NOT_FOUND");
      }

      const allPlayerIds = [...proposerAssets, ...counterpartyAssets]
        .map((asset) => (asset.assetType === "PLAYER" ? asset.playerId?.trim() ?? "" : ""))
        .filter((value) => value.length > 0);
      const allPickIds = [...proposerAssets, ...counterpartyAssets]
        .map((asset) => (asset.assetType === "PICK" ? asset.futurePickId?.trim() ?? "" : ""))
        .filter((value) => value.length > 0);

      const [players, activeContracts, picks] = await Promise.all([
        allPlayerIds.length > 0
          ? client.player.findMany({
              where: {
                id: {
                  in: allPlayerIds,
                },
              },
              select: {
                id: true,
                name: true,
                position: true,
              },
            })
          : Promise.resolve([]),
        allPlayerIds.length > 0
          ? client.contract.findMany({
              where: {
                seasonId: input.seasonId,
                playerId: {
                  in: allPlayerIds,
                },
                status: {
                  in: [...ACTIVE_CONTRACT_STATUSES],
                },
              },
              select: {
                id: true,
                teamId: true,
                playerId: true,
              },
            })
          : Promise.resolve([]),
        allPickIds.length > 0
          ? client.futurePick.findMany({
              where: {
                leagueId: input.leagueId,
                id: {
                  in: allPickIds,
                },
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
            })
          : Promise.resolve([]),
      ]);

      const playerById = new Map(players.map((player) => [player.id, player]));
      const contractByTeamAndPlayer = new Map(
        activeContracts.map((contract) => [`${contract.teamId}:${contract.playerId}`, contract]),
      );
      const pickById = new Map(picks.map((pick) => [pick.id, pick]));
      const seenFingerprints = new Set<string>();
      const assets: TradeAssetWriteInput[] = [];

      function appendAssets(
        selections: TradeAssetSelectionInput[],
        fromTeamId: string,
        toTeamId: string,
        offset: number,
      ) {
        selections.forEach((selection, index) => {
          if (selection.assetType === "PLAYER") {
            const playerId = selection.playerId?.trim() ?? "";
            if (!playerId) {
              throw new Error("INVALID_REQUEST");
            }

            const player = playerById.get(playerId) ?? null;
            if (!player) {
              throw new Error("PLAYER_NOT_FOUND");
            }

            const contract = contractByTeamAndPlayer.get(`${fromTeamId}:${playerId}`) ?? null;
            if (!contract) {
              throw new Error("TRADE_STATE_CONFLICT");
            }

            const fingerprint = `PLAYER:${playerId}`;
            if (seenFingerprints.has(fingerprint)) {
              throw new Error("INVALID_REQUEST");
            }
            seenFingerprints.add(fingerprint);

            assets.push({
              fromTeamId,
              toTeamId,
              assetType: "PLAYER",
              playerId,
              contractId: contract.id,
              assetOrder: offset + index,
              snapshotLabel: `${player.name} (${player.position})`,
            });
            return;
          }

          if (selection.assetType === "PICK") {
            const futurePickId = selection.futurePickId?.trim() ?? "";
            if (!futurePickId) {
              throw new Error("INVALID_REQUEST");
            }

            const pick = pickById.get(futurePickId) ?? null;
            if (!pick) {
              throw new Error("INVALID_REQUEST");
            }

            if (pick.currentTeamId !== fromTeamId || pick.isUsed) {
              throw new Error("TRADE_STATE_CONFLICT");
            }

            const fingerprint = `PICK:${futurePickId}`;
            if (seenFingerprints.has(fingerprint)) {
              throw new Error("INVALID_REQUEST");
            }
            seenFingerprints.add(fingerprint);

            assets.push({
              fromTeamId,
              toTeamId,
              assetType: "PICK",
              futurePickId,
              assetOrder: offset + index,
              snapshotLabel: buildPickLabel({
                seasonYear: pick.seasonYear,
                round: pick.round,
                overall: pick.overall,
                originalTeamName: pick.originalTeam.name,
                originalTeamAbbreviation: pick.originalTeam.abbreviation,
              }),
            });
            return;
          }

          throw new Error("INVALID_REQUEST");
        });
      }

      appendAssets(proposerAssets, input.proposerTeamId, input.counterpartyTeamId, 0);
      appendAssets(counterpartyAssets, input.counterpartyTeamId, input.proposerTeamId, assets.length);

      return {
        proposerTeam,
        counterpartyTeam,
        assets: assets.map((asset) => ({
          fromTeamId: asset.fromTeamId,
          toTeamId: asset.toTeamId,
          assetType: asset.assetType,
          playerId: asset.playerId ?? null,
          futurePickId: asset.futurePickId ?? null,
          contractId: asset.contractId ?? null,
          assetOrder: asset.assetOrder ?? 0,
          snapshotLabel: asset.snapshotLabel ?? null,
        })),
      };
    },
  };
}

