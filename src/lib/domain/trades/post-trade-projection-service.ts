import { TeamValidationContext } from "@/lib/compliance/context";
import { createReadOnlyValidationContextLoader } from "@/lib/compliance/read-context";
import { evaluateComplianceFromContext } from "@/lib/compliance/service";
import {
  buildImpactSnapshot,
  getIntroducedFindings,
  mapImpactFindings,
} from "@/lib/domain/contracts/impact-preview-shared";
import type { ContractDbClient } from "@/lib/domain/contracts/shared";
import type { PreparedTradeAsset, TradePackageInput } from "@/lib/domain/trades/types";
import type { TradePostProjection } from "@/types/trade-workflow";
import { prisma } from "@/lib/prisma";

type TradeProjectionInput = Pick<
  TradePackageInput,
  "leagueId" | "seasonId" | "proposerTeamId" | "counterpartyTeamId"
> & {
  assets: PreparedTradeAsset[];
};

function cloneContext(context: TeamValidationContext): TeamValidationContext {
  return {
    ...context,
    team: { ...context.team },
    season: { ...context.season },
    league: { ...context.league },
    ruleset: { ...context.ruleset },
    rosterSlots: context.rosterSlots.map((slot) => ({
      ...slot,
      player: { ...slot.player },
    })),
    contracts: context.contracts.map((contract) => ({
      ...contract,
      player: { ...contract.player },
    })),
    capPenalties: context.capPenalties.map((penalty) => ({
      ...penalty,
    })),
  };
}

function slotLabelForIncomingAsset(input: {
  teamId: string;
  playerId: string;
  currentCount: number;
}) {
  return `TRADE_IN_${input.currentCount + 1}_${input.playerId.slice(0, 6)}_${input.teamId.slice(0, 4)}`;
}

function applyTradeToContexts(input: {
  teamAContext: TeamValidationContext;
  teamBContext: TeamValidationContext;
  proposerTeamId: string;
  counterpartyTeamId: string;
  assets: PreparedTradeAsset[];
}) {
  const teamById = new Map<string, TeamValidationContext>([
    [input.proposerTeamId, input.teamAContext],
    [input.counterpartyTeamId, input.teamBContext],
  ]);

  for (const asset of input.assets) {
    if (asset.assetType !== "PLAYER" || !asset.playerId) {
      continue;
    }

    const fromContext = teamById.get(asset.fromTeamId) ?? null;
    const toContext = teamById.get(asset.toTeamId) ?? null;
    if (!fromContext || !toContext) {
      continue;
    }

    const rosterSlot = fromContext.rosterSlots.find((slot) => slot.player.id === asset.playerId) ?? null;
    const contract = fromContext.contracts.find(
      (candidate) =>
        candidate.player.id === asset.playerId &&
        (!asset.contractId || candidate.id === asset.contractId),
    ) ?? null;

    fromContext.rosterSlots = fromContext.rosterSlots.filter(
      (slot) => slot.player.id !== asset.playerId,
    );
    fromContext.contracts = fromContext.contracts.filter(
      (candidate) => candidate.player.id !== asset.playerId,
    );

    if (rosterSlot) {
      toContext.rosterSlots.push({
        ...rosterSlot,
        id: `${rosterSlot.id}:trade-preview:${asset.toTeamId}`,
        slotType: "BENCH",
        slotLabel: slotLabelForIncomingAsset({
          teamId: asset.toTeamId,
          playerId: asset.playerId,
          currentCount: toContext.rosterSlots.length,
        }),
      });
    }

    if (contract) {
      toContext.contracts.push({
        ...contract,
      });
    }
  }
}

function buildTeamProjection(input: {
  beforeContext: TeamValidationContext;
  afterContext: TeamValidationContext;
}) {
  const beforeReport = evaluateComplianceFromContext(input.beforeContext);
  const afterReport = evaluateComplianceFromContext(input.afterContext);
  const beforeSnapshot = buildImpactSnapshot(input.beforeContext, beforeReport);
  const afterSnapshot = buildImpactSnapshot(input.afterContext, afterReport);

  return {
    teamId: input.beforeContext.team.id,
    teamName: input.beforeContext.team.name,
    rosterCountBefore: beforeSnapshot.rosterCount,
    rosterCountAfter: afterSnapshot.rosterCount,
    activeCapBefore: beforeSnapshot.activeCapTotal,
    activeCapAfter: afterSnapshot.activeCapTotal,
    deadCapBefore: beforeSnapshot.deadCapTotal,
    deadCapAfter: afterSnapshot.deadCapTotal,
    hardCapBefore: beforeSnapshot.hardCapTotal,
    hardCapAfter: afterSnapshot.hardCapTotal,
    complianceStatusBefore: beforeSnapshot.complianceStatus,
    complianceStatusAfter: afterSnapshot.complianceStatus,
    introducedFindings: mapImpactFindings(
      getIntroducedFindings(beforeReport, afterReport),
    ).map((finding) => ({
      code: finding.ruleCode,
      severity: finding.severity,
      message: finding.message,
      category: (finding.severity === "error" ? "review" : "warning") as
        | "review"
        | "warning",
      teamId: input.beforeContext.team.id,
      context: finding.context,
    })),
  };
}

export function createPostTradeProjectionService(client: ContractDbClient = prisma) {
  const validationLoader = createReadOnlyValidationContextLoader(client);

  return {
    async project(input: TradeProjectionInput): Promise<TradePostProjection> {
      const [teamAContext, teamBContext] = await Promise.all([
        validationLoader.loadTeamValidationContext({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.proposerTeamId,
        }),
        validationLoader.loadTeamValidationContext({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          teamId: input.counterpartyTeamId,
        }),
      ]);

      if (!teamAContext || !teamBContext) {
        return {
          available: false,
          teamA: null,
          teamB: null,
        };
      }

      const afterAContext = cloneContext(teamAContext);
      const afterBContext = cloneContext(teamBContext);

      applyTradeToContexts({
        teamAContext: afterAContext,
        teamBContext: afterBContext,
        proposerTeamId: input.proposerTeamId,
        counterpartyTeamId: input.counterpartyTeamId,
        assets: input.assets,
      });

      return {
        available: true,
        teamA: buildTeamProjection({
          beforeContext: teamAContext,
          afterContext: afterAContext,
        }),
        teamB: buildTeamProjection({
          beforeContext: teamBContext,
          afterContext: afterBContext,
        }),
      };
    },
  };
}
