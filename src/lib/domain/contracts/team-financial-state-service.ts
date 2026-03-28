import { createContractLedgerService } from "@/lib/domain/contracts/contract-ledger-service";
import { computeActiveCapTotal } from "@/lib/domain/contracts/active-cap-calculator";
import { createDeadCapChargeService } from "@/lib/domain/contracts/dead-cap-charge-service";
import { computeDeadCapTotal } from "@/lib/domain/contracts/dead-cap-calculator";
import { computeHardCapTotal } from "@/lib/domain/contracts/hard-cap-calculator";
import { ContractDbClient } from "@/lib/domain/contracts/shared";
import { prisma } from "@/lib/prisma";

export type TeamSeasonFinancialState = {
  activeCapTotal: number;
  deadCapTotal: number;
  hardCapTotal: number;
  backfillGaps: string[];
};

export function createTeamFinancialStateService(client: ContractDbClient = prisma) {
  return createTeamFinancialStateServiceWithDependencies(client, {
    ledgerService: createContractLedgerService(client),
    deadCapChargeService: createDeadCapChargeService(client),
  });
}

export function createTeamFinancialStateServiceWithDependencies(
  client: ContractDbClient = prisma,
  dependencies: {
    ledgerService: Pick<
      ReturnType<typeof createContractLedgerService>,
      "ensureTeamSeasonLedgerCoverage"
    >;
    deadCapChargeService: Pick<
      ReturnType<typeof createDeadCapChargeService>,
      "ensureLegacyDeadCapCoverage"
    >;
  },
) {
  const { ledgerService, deadCapChargeService } = dependencies;
  const readTeamSeasonFinancials = async (input: {
    teamId: string;
    seasonId: string;
  }): Promise<TeamSeasonFinancialState> => {
    const [ledgers, deadCapCharges] = await Promise.all([
      client.contractSeasonLedger.findMany({
        where: {
          seasonId: input.seasonId,
          contract: {
            teamId: input.teamId,
          },
        },
        select: {
          annualSalary: true,
          ledgerStatus: true,
        },
      }),
      client.deadCapCharge.findMany({
        where: {
          teamId: input.teamId,
          appliesToSeasonId: input.seasonId,
        },
        select: {
          systemCalculatedAmount: true,
          adjustedAmount: true,
        },
      }),
    ]);

    const activeCapTotal = computeActiveCapTotal(ledgers);
    const deadCapTotal = computeDeadCapTotal(deadCapCharges);

    return {
      activeCapTotal,
      deadCapTotal,
      hardCapTotal: computeHardCapTotal(activeCapTotal, deadCapTotal),
      backfillGaps: [],
    };
  };

  return {
    readTeamSeasonFinancials,

    async computeTeamSeasonFinancials(input: { teamId: string; seasonId: string }) {
      const season = await client.season.findUnique({
        where: { id: input.seasonId },
        select: {
          id: true,
          leagueId: true,
        },
      });

      if (!season) {
        throw new Error("SEASON_NOT_FOUND");
      }

      await ledgerService.ensureTeamSeasonLedgerCoverage(input);
      const deadCapCoverage = await deadCapChargeService.ensureLegacyDeadCapCoverage({
        leagueId: season.leagueId,
        teamId: input.teamId,
        seasonId: input.seasonId,
      });
      const financials = await readTeamSeasonFinancials(input);

      return {
        ...financials,
        backfillGaps: deadCapCoverage.gaps,
      };
    },
  };
}
