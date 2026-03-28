import { ContractStatus, LeaguePhase } from "@prisma/client";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import type { ContractDbClient } from "@/lib/domain/contracts/shared";
import { createPostTradeProjectionService } from "@/lib/domain/trades/post-trade-projection-service";
import type {
  PreparedTradeAsset,
  TradePackageInput,
  TradePolicyEvaluation,
} from "@/lib/domain/trades/types";
import type { TradeWorkflowFinding } from "@/types/trade-workflow";
import { prisma } from "@/lib/prisma";

type TradePolicyInput = Pick<
  TradePackageInput,
  "leagueId" | "seasonId" | "proposerTeamId" | "counterpartyTeamId"
> & {
  assets: PreparedTradeAsset[];
  trigger: TradePolicyEvaluation["trigger"];
};

function assetFingerprint(assets: PreparedTradeAsset[]) {
  return JSON.stringify(
    [...assets]
      .sort((left, right) => left.assetOrder - right.assetOrder)
      .map((asset) => ({
        assetType: asset.assetType,
        fromTeamId: asset.fromTeamId,
        toTeamId: asset.toTeamId,
        playerId: asset.playerId,
        futurePickId: asset.futurePickId,
        contractId: asset.contractId,
      })),
  );
}

function deriveOutcome(findings: TradeWorkflowFinding[]): TradePolicyEvaluation["outcome"] {
  if (findings.some((finding) => finding.category === "hard_block")) {
    return "FAIL_HARD_BLOCK";
  }

  if (findings.some((finding) => finding.category === "review")) {
    return "FAIL_REQUIRES_COMMISSIONER";
  }

  if (findings.some((finding) => finding.severity === "warning")) {
    return "PASS_WITH_WARNING";
  }

  return "PASS";
}

function maybePush(
  findings: TradeWorkflowFinding[],
  condition: boolean,
  finding: TradeWorkflowFinding,
) {
  if (condition) {
    findings.push(finding);
  }
}

export function createTradePolicyEvaluator(
  client: ContractDbClient = prisma,
  dependencies?: {
    postTradeProjectionService?: Pick<
      ReturnType<typeof createPostTradeProjectionService>,
      "project"
    >;
  },
) {
  const postTradeProjectionService =
    dependencies?.postTradeProjectionService ?? createPostTradeProjectionService(client);

  return {
    async evaluate(input: TradePolicyInput): Promise<TradePolicyEvaluation> {
      const findings: TradeWorkflowFinding[] = [];
      const season = await client.season.findFirst({
        where: {
          id: input.seasonId,
          leagueId: input.leagueId,
        },
        select: {
          id: true,
          phase: true,
        },
      });

      if (!season) {
        throw new Error("SEASON_NOT_FOUND");
      }

      if (season.phase === LeaguePhase.PLAYOFFS) {
        findings.push({
          code: "TRADE_WINDOW_CLOSED",
          severity: "error",
          category: "hard_block",
          message: "Trades are closed during the playoffs phase.",
          teamId: null,
          context: {
            phase: season.phase,
          },
        });
      }

      const proposerAssets = input.assets.filter(
        (asset) => asset.fromTeamId === input.proposerTeamId,
      );
      const counterpartyAssets = input.assets.filter(
        (asset) => asset.fromTeamId === input.counterpartyTeamId,
      );

      maybePush(findings, proposerAssets.length === 0, {
        code: "PROPOSER_ASSET_REQUIRED",
        severity: "error",
        category: "hard_block",
        message: "The proposing team must send at least one asset.",
        teamId: input.proposerTeamId,
      });
      maybePush(findings, counterpartyAssets.length === 0, {
        code: "COUNTERPARTY_ASSET_REQUIRED",
        severity: "error",
        category: "hard_block",
        message: "The counterparty team must send at least one asset.",
        teamId: input.counterpartyTeamId,
      });
      maybePush(
        findings,
        proposerAssets.filter((asset) => asset.assetType === "PLAYER").length === 0,
        {
          code: "PROPOSER_PLAYER_REQUIRED",
          severity: "error",
          category: "hard_block",
          message: "The proposing team must include at least one player.",
          teamId: input.proposerTeamId,
        },
      );
      maybePush(
        findings,
        counterpartyAssets.filter((asset) => asset.assetType === "PLAYER").length === 0,
        {
          code: "COUNTERPARTY_PLAYER_REQUIRED",
          severity: "error",
          category: "hard_block",
          message: "The counterparty team must include at least one player.",
          teamId: input.counterpartyTeamId,
        },
      );

      const playerIds = input.assets
        .map((asset) => asset.playerId)
        .filter((value): value is string => Boolean(value));
      const pickIds = input.assets
        .map((asset) => asset.futurePickId)
        .filter((value): value is string => Boolean(value));

      const [players, contracts, rosterSlots, picks] = await Promise.all([
        playerIds.length > 0
          ? client.player.findMany({
              where: {
                id: {
                  in: playerIds,
                },
              },
              select: {
                id: true,
                name: true,
                isRestricted: true,
              },
            })
          : Promise.resolve([]),
        playerIds.length > 0
          ? client.contract.findMany({
              where: {
                seasonId: input.seasonId,
                playerId: {
                  in: playerIds,
                },
                status: {
                  in: [...ACTIVE_CONTRACT_STATUSES],
                },
              },
              select: {
                id: true,
                playerId: true,
                teamId: true,
                status: true,
                isFranchiseTag: true,
              },
            })
          : Promise.resolve([]),
        playerIds.length > 0
          ? client.rosterAssignment.findMany({
              where: {
                seasonId: input.seasonId,
                playerId: {
                  in: playerIds,
                },
                endedAt: null,
              },
              select: {
                playerId: true,
                teamId: true,
              },
            })
          : Promise.resolve([]),
        pickIds.length > 0
          ? client.futurePick.findMany({
              where: {
                leagueId: input.leagueId,
                id: {
                  in: pickIds,
                },
              },
              select: {
                id: true,
                currentTeamId: true,
                isUsed: true,
              },
            })
          : Promise.resolve([]),
      ]);

      const playerById = new Map(players.map((player) => [player.id, player]));
      const contractByPlayerId = new Map(contracts.map((contract) => [contract.playerId, contract]));
      const rosterByPlayerId = new Map(rosterSlots.map((slot) => [slot.playerId, slot]));
      const pickById = new Map(picks.map((pick) => [pick.id, pick]));
      const seenPlayers = new Set<string>();
      const seenPicks = new Set<string>();

      for (const asset of input.assets) {
        if (asset.assetType === "PLAYER" && asset.playerId) {
          const player = playerById.get(asset.playerId) ?? null;
          const contract = contractByPlayerId.get(asset.playerId) ?? null;
          const rosterSlot = rosterByPlayerId.get(asset.playerId) ?? null;

          if (seenPlayers.has(asset.playerId)) {
            findings.push({
              code: "DUPLICATE_PLAYER_ASSET",
              severity: "error",
              category: "hard_block",
              message: "A player can only appear once in a trade package.",
              teamId: asset.fromTeamId,
              context: {
                playerId: asset.playerId,
              },
            });
            continue;
          }
          seenPlayers.add(asset.playerId);

          if (!player) {
            findings.push({
              code: "PLAYER_NOT_FOUND",
              severity: "error",
              category: "hard_block",
              message: "A player asset could not be resolved.",
              teamId: asset.fromTeamId,
              context: {
                playerId: asset.playerId,
              },
            });
            continue;
          }

          if (player.isRestricted) {
            findings.push({
              code: "RESTRICTED_PLAYER_BLOCKED",
              severity: "error",
              category: "hard_block",
              message: `${player.name} is restricted and cannot be traded.`,
              teamId: asset.fromTeamId,
              context: {
                playerId: asset.playerId,
              },
            });
          }

          if (!contract || contract.teamId !== asset.fromTeamId) {
            findings.push({
              code: "PLAYER_CONTRACT_OWNERSHIP_INVALID",
              severity: "error",
              category: "hard_block",
              message: "The sending team does not currently control this player contract.",
              teamId: asset.fromTeamId,
              context: {
                playerId: asset.playerId,
              },
            });
          } else if (asset.contractId && contract.id !== asset.contractId) {
            findings.push({
              code: "PLAYER_CONTRACT_CHANGED",
              severity: "error",
              category: "hard_block",
              message: "The selected contract snapshot is no longer current.",
              teamId: asset.fromTeamId,
              context: {
                playerId: asset.playerId,
                expectedContractId: asset.contractId,
                currentContractId: contract.id,
              },
            });
          }

          if (!rosterSlot || rosterSlot.teamId !== asset.fromTeamId) {
            findings.push({
              code: "PLAYER_ROSTER_OWNERSHIP_INVALID",
              severity: "error",
              category: "hard_block",
              message: "The sending team does not currently roster this player.",
              teamId: asset.fromTeamId,
              context: {
                playerId: asset.playerId,
              },
            });
          }

          if (
            contract &&
            (contract.isFranchiseTag || contract.status === ContractStatus.TAGGED)
          ) {
            findings.push({
              code: "TAGGED_PLAYER_REVIEW_REQUIRED",
              severity: "warning",
              category: "review",
              message: `${player.name} is currently tagged and requires commissioner review to move.`,
              teamId: asset.fromTeamId,
              context: {
                playerId: asset.playerId,
                contractId: contract.id,
              },
            });
          }
          continue;
        }

        if (asset.assetType === "PICK" && asset.futurePickId) {
          const pick = pickById.get(asset.futurePickId) ?? null;

          if (seenPicks.has(asset.futurePickId)) {
            findings.push({
              code: "DUPLICATE_PICK_ASSET",
              severity: "error",
              category: "hard_block",
              message: "A pick can only appear once in a trade package.",
              teamId: asset.fromTeamId,
              context: {
                futurePickId: asset.futurePickId,
              },
            });
            continue;
          }
          seenPicks.add(asset.futurePickId);

          if (!pick) {
            findings.push({
              code: "PICK_NOT_FOUND",
              severity: "error",
              category: "hard_block",
              message: "A future pick asset could not be resolved.",
              teamId: asset.fromTeamId,
              context: {
                futurePickId: asset.futurePickId,
              },
            });
            continue;
          }

          if (pick.currentTeamId !== asset.fromTeamId) {
            findings.push({
              code: "PICK_OWNERSHIP_INVALID",
              severity: "error",
              category: "hard_block",
              message: "The sending team does not currently own this pick.",
              teamId: asset.fromTeamId,
              context: {
                futurePickId: asset.futurePickId,
              },
            });
          }

          if (pick.isUsed) {
            findings.push({
              code: "PICK_ALREADY_USED",
              severity: "error",
              category: "hard_block",
              message: "Used picks cannot be traded.",
              teamId: asset.fromTeamId,
              context: {
                futurePickId: asset.futurePickId,
              },
            });
          }
        }
      }

      const postTradeProjection = await postTradeProjectionService.project({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        proposerTeamId: input.proposerTeamId,
        counterpartyTeamId: input.counterpartyTeamId,
        assets: input.assets,
      });

      if (postTradeProjection.available) {
        for (const teamProjection of [
          postTradeProjection.teamA,
          postTradeProjection.teamB,
        ]) {
          if (!teamProjection) {
            continue;
          }

          for (const finding of teamProjection.introducedFindings) {
            findings.push({
              ...finding,
              category: "review",
              teamId: teamProjection.teamId,
              message: `${teamProjection.teamName}: ${finding.message}`,
            });
          }
        }
      }

      const outcome = deriveOutcome(findings);
      const reviewReasons = findings
        .filter((finding) => finding.category === "review")
        .map((finding) => finding.message);

      return {
        outcome,
        trigger: input.trigger,
        assetFingerprint: assetFingerprint(input.assets),
        findings,
        remediation:
          outcome === "FAIL_REQUIRES_COMMISSIONER"
            ? {
                requiresCommissionerReview: true,
                reasons: reviewReasons,
              }
            : null,
        postTradeProjection,
      };
    },
  };
}
