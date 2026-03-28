import { createHash } from "crypto";
import { LeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import {
  LeagueSnapshotData,
  LeagueSnapshotPayload,
  SNAPSHOT_VERSION,
  SnapshotEntityCounts,
  SnapshotPreviewReceipt,
  SnapshotRestoreImpactSummary,
  SnapshotValidationFinding,
} from "@/types/snapshot";

function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sortJsonDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonDeep(item));
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    return Object.keys(input)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((accumulator, key) => {
        accumulator[key] = sortJsonDeep(input[key]);
        return accumulator;
      }, {});
  }

  return value;
}

const REQUIRED_DATA_KEYS: Array<keyof LeagueSnapshotData> = [
  "leagues",
  "seasons",
  "rulesets",
  "owners",
  "teams",
  "players",
  "rosterSlots",
  "contracts",
  "capPenalties",
  "futurePicks",
  "drafts",
  "draftSelections",
  "trades",
  "tradeAssets",
  "transactions",
];

const SNAPSHOT_COUNT_KEYS: Array<keyof SnapshotEntityCounts> = [
  "leagues",
  "seasons",
  "rulesets",
  "owners",
  "teams",
  "players",
  "rosterSlots",
  "contracts",
  "capPenalties",
  "futurePicks",
  "drafts",
  "draftSelections",
  "trades",
  "tradeAssets",
  "transactions",
];

export async function buildLeagueSnapshot(context: LeagueContext): Promise<LeagueSnapshotPayload> {
  const [leagues, seasons, rulesets, owners, teams, players, rosterSlots, contracts, capPenalties, futurePicks, drafts, draftSelections, trades, tradeAssets, transactions] =
    await Promise.all([
      prisma.league.findMany({
        where: { id: context.leagueId },
      }),
      prisma.season.findMany({
        where: { leagueId: context.leagueId },
        orderBy: { year: "asc" },
      }),
      prisma.leagueRuleSet.findMany({
        where: { leagueId: context.leagueId },
        orderBy: [{ version: "asc" }],
      }),
      prisma.owner.findMany({
        where: {
          teams: {
            some: {
              leagueId: context.leagueId,
            },
          },
        },
      }),
      prisma.team.findMany({
        where: { leagueId: context.leagueId },
        orderBy: { name: "asc" },
      }),
      prisma.player.findMany({
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
      prisma.rosterSlot.findMany({
        where: {
          season: {
            leagueId: context.leagueId,
          },
        },
      }),
      prisma.contract.findMany({
        where: {
          season: {
            leagueId: context.leagueId,
          },
        },
      }),
      prisma.capPenalty.findMany({
        where: {
          season: {
            leagueId: context.leagueId,
          },
        },
      }),
      prisma.futurePick.findMany({
        where: {
          leagueId: context.leagueId,
        },
      }),
      prisma.draft.findMany({
        where: {
          leagueId: context.leagueId,
        },
      }),
      prisma.draftSelection.findMany({
        where: {
          draft: {
            leagueId: context.leagueId,
          },
        },
      }),
      prisma.trade.findMany({
        where: {
          leagueId: context.leagueId,
        },
      }),
      prisma.tradeAsset.findMany({
        where: {
          trade: {
            leagueId: context.leagueId,
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          leagueId: context.leagueId,
        },
      }),
    ]);

  return {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      seasonYear: context.seasonYear,
    },
    data: {
      leagues: toPlain(leagues),
      seasons: toPlain(seasons),
      rulesets: toPlain(rulesets),
      owners: toPlain(owners),
      teams: toPlain(teams),
      players: toPlain(players),
      rosterSlots: toPlain(rosterSlots),
      contracts: toPlain(contracts),
      capPenalties: toPlain(capPenalties),
      futurePicks: toPlain(futurePicks),
      drafts: toPlain(drafts),
      draftSelections: toPlain(draftSelections),
      trades: toPlain(trades),
      tradeAssets: toPlain(tradeAssets),
      transactions: toPlain(transactions),
    },
  };
}

export async function getSnapshotRestoreBaselineCounts(): Promise<SnapshotEntityCounts> {
  const [leagues, seasons, rulesets, owners, teams, players, rosterSlots, contracts, capPenalties, futurePicks, drafts, draftSelections, trades, tradeAssets, transactions] =
    await Promise.all([
      prisma.league.count(),
      prisma.season.count(),
      prisma.leagueRuleSet.count(),
      prisma.owner.count(),
      prisma.team.count(),
      prisma.player.count(),
      prisma.rosterSlot.count(),
      prisma.contract.count(),
      prisma.capPenalty.count(),
      prisma.futurePick.count(),
      prisma.draft.count(),
      prisma.draftSelection.count(),
      prisma.trade.count(),
      prisma.tradeAsset.count(),
      prisma.transaction.count(),
    ]);

  return {
    leagues,
    seasons,
    rulesets,
    owners,
    teams,
    players,
    rosterSlots,
    contracts,
    capPenalties,
    futurePicks,
    drafts,
    draftSelections,
    trades,
    tradeAssets,
    transactions,
  };
}

function sumCounts(counts: SnapshotEntityCounts): number {
  return SNAPSHOT_COUNT_KEYS.reduce((total, key) => total + counts[key], 0);
}

export function summarizeSnapshotCounts(data: LeagueSnapshotData): SnapshotEntityCounts {
  return {
    leagues: data.leagues.length,
    seasons: data.seasons.length,
    rulesets: data.rulesets.length,
    owners: data.owners.length,
    teams: data.teams.length,
    players: data.players.length,
    rosterSlots: data.rosterSlots.length,
    contracts: data.contracts.length,
    capPenalties: data.capPenalties.length,
    futurePicks: data.futurePicks.length,
    drafts: data.drafts.length,
    draftSelections: data.draftSelections.length,
    trades: data.trades.length,
    tradeAssets: data.tradeAssets.length,
    transactions: data.transactions.length,
  };
}

export function buildSnapshotRestoreImpactSummary(input: {
  activeContext: Pick<LeagueContext, "leagueId" | "seasonId" | "seasonYear">;
  snapshot: LeagueSnapshotPayload;
  currentCounts: SnapshotEntityCounts;
  incomingCounts: SnapshotEntityCounts;
}): SnapshotRestoreImpactSummary {
  const perEntity = SNAPSHOT_COUNT_KEYS.reduce<SnapshotRestoreImpactSummary["perEntity"]>(
    (accumulator, key) => {
      const current = input.currentCounts[key];
      const incoming = input.incomingCounts[key];
      accumulator[key] = {
        current,
        incoming,
        delta: incoming - current,
      };
      return accumulator;
    },
    {} as SnapshotRestoreImpactSummary["perEntity"],
  );

  const currentRecords = sumCounts(input.currentCounts);
  const incomingRecords = sumCounts(input.incomingCounts);

  return {
    perEntity,
    totals: {
      currentRecords,
      incomingRecords,
      deltaRecords: incomingRecords - currentRecords,
      recordsToDelete: currentRecords,
      recordsToInsert: incomingRecords,
    },
    source: {
      snapshotLeagueId: input.snapshot.source.leagueId,
      snapshotSeasonId: input.snapshot.source.seasonId,
      snapshotSeasonYear: input.snapshot.source.seasonYear,
      activeLeagueId: input.activeContext.leagueId,
      activeSeasonId: input.activeContext.seasonId,
      activeSeasonYear: input.activeContext.seasonYear,
      matchesActiveLeague: input.snapshot.source.leagueId === input.activeContext.leagueId,
      matchesActiveSeason: input.snapshot.source.seasonId === input.activeContext.seasonId,
    },
  };
}

export function buildSnapshotContentHash(snapshot: LeagueSnapshotPayload): string {
  const canonical = JSON.stringify(sortJsonDeep(snapshot));
  return createHash("sha256").update(canonical).digest("hex");
}

export function buildSnapshotPreviewReceipt(snapshot: LeagueSnapshotPayload): SnapshotPreviewReceipt {
  const snapshotHash = buildSnapshotContentHash(snapshot);
  return {
    snapshotHash,
    confirmationPhrase: `APPLY RESTORE ${snapshotHash.slice(0, 8).toUpperCase()}`,
  };
}

export function validateSnapshotPayload(value: unknown): {
  valid: boolean;
  findings: SnapshotValidationFinding[];
  snapshot: LeagueSnapshotPayload | null;
} {
  const findings: SnapshotValidationFinding[] = [];

  if (!value || typeof value !== "object") {
    findings.push({
      code: "SNAPSHOT_NOT_OBJECT",
      message: "Snapshot payload must be an object.",
      path: "snapshot",
    });
    return { valid: false, findings, snapshot: null };
  }

  const payload = value as Partial<LeagueSnapshotPayload>;

  if (payload.version !== SNAPSHOT_VERSION) {
    findings.push({
      code: "SNAPSHOT_VERSION_INVALID",
      message: `Snapshot version must be ${SNAPSHOT_VERSION}.`,
      path: "snapshot.version",
    });
  }

  if (!payload.exportedAt || Number.isNaN(Date.parse(payload.exportedAt))) {
    findings.push({
      code: "SNAPSHOT_EXPORTED_AT_INVALID",
      message: "Snapshot exportedAt must be a valid ISO timestamp.",
      path: "snapshot.exportedAt",
    });
  }

  if (!payload.source || typeof payload.source !== "object") {
    findings.push({
      code: "SNAPSHOT_SOURCE_INVALID",
      message: "Snapshot source must be an object.",
      path: "snapshot.source",
    });
  } else {
    const source = payload.source as LeagueSnapshotPayload["source"];
    if (!source.leagueId || typeof source.leagueId !== "string") {
      findings.push({
        code: "SNAPSHOT_SOURCE_LEAGUE_INVALID",
        message: "Snapshot source leagueId is required.",
        path: "snapshot.source.leagueId",
      });
    }
    if (!source.seasonId || typeof source.seasonId !== "string") {
      findings.push({
        code: "SNAPSHOT_SOURCE_SEASON_INVALID",
        message: "Snapshot source seasonId is required.",
        path: "snapshot.source.seasonId",
      });
    }
    if (!Number.isInteger(source.seasonYear)) {
      findings.push({
        code: "SNAPSHOT_SOURCE_YEAR_INVALID",
        message: "Snapshot source seasonYear must be an integer.",
        path: "snapshot.source.seasonYear",
      });
    }
  }

  if (!payload.data || typeof payload.data !== "object") {
    findings.push({
      code: "SNAPSHOT_DATA_INVALID",
      message: "Snapshot data must be an object.",
      path: "snapshot.data",
    });
    return { valid: findings.length === 0, findings, snapshot: null };
  }

  const data = payload.data as Partial<LeagueSnapshotData>;
  REQUIRED_DATA_KEYS.forEach((key) => {
    if (!Array.isArray(data[key])) {
      findings.push({
        code: "SNAPSHOT_DATA_ARRAY_REQUIRED",
        message: `Snapshot data.${key} must be an array.`,
        path: `snapshot.data.${key}`,
      });
    }
  });

  if (findings.length > 0) {
    return {
      valid: false,
      findings,
      snapshot: null,
    };
  }

  return {
    valid: true,
    findings,
    snapshot: payload as LeagueSnapshotPayload,
  };
}
