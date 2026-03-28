import {
  LeaguePhase,
  Prisma,
  Team,
  Trade,
  TradeAsset,
  TradeAssetType,
} from "@prisma/client";
import { ACTIVE_CONTRACT_STATUSES } from "@/lib/domain/contracts/shared";
import { LeagueContext } from "@/lib/league-context";
import { prisma } from "@/lib/prisma";
import {
  isTradeAssetType,
  TradeAnalyzeRequest,
  TradeAssetSummary,
  TradeFinding,
  TradeSummary,
  TradeTeamImpact,
} from "@/types/trade";

type ParsedTradeAssetInput = {
  assetType: TradeAssetType;
  playerId: string | null;
  futurePickId: string | null;
};

export type ParsedTradeRequest = {
  teamAId: string;
  teamBId: string;
  teamAAssets: ParsedTradeAssetInput[];
  teamBAssets: ParsedTradeAssetInput[];
  notes: string | null;
};

type TeamSnapshot = {
  rosterCount: number;
  activeCap: number;
  deadCap: number;
  totalCap: number;
};

type TradeAnalysisContext = {
  league: LeagueContext;
  seasonPhase: LeaguePhase;
};

export type TradeAnalysisResult = {
  trade: {
    teamAId: string;
    teamBId: string;
    notes: string | null;
  };
  legal: boolean;
  findings: TradeFinding[];
  assets: TradeAssetSummary[];
  impact: {
    teamA: TradeTeamImpact | null;
    teamB: TradeTeamImpact | null;
  };
};

type TradeWithIncludes = Trade & {
  teamA: Pick<Team, "id" | "name" | "abbreviation">;
  teamB: Pick<Team, "id" | "name" | "abbreviation">;
  assets: (TradeAsset & {
    player: {
      id: string;
      name: string;
    } | null;
    futurePick: {
      id: string;
      seasonYear: number;
      round: number;
      overall: number | null;
      originalTeam: {
        name: string;
        abbreviation: string | null;
      };
    } | null;
  })[];
};

function parseAssetList(raw: unknown, side: "teamAAssets" | "teamBAssets") {
  const findings: TradeFinding[] = [];

  if (!Array.isArray(raw)) {
    findings.push({
      code: "INVALID_ASSET_LIST",
      severity: "error",
      message: `${side} must be an array.`,
    });
    return { findings, assets: [] as ParsedTradeAssetInput[] };
  }

  const assets: ParsedTradeAssetInput[] = [];

  raw.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") {
      findings.push({
        code: "INVALID_ASSET_ITEM",
        severity: "error",
        message: `${side}[${index}] must be an object.`,
      });
      return;
    }

    const assetType = (entry as { assetType?: unknown }).assetType;
    const playerId = (entry as { playerId?: unknown }).playerId;
    const futurePickId = (entry as { futurePickId?: unknown }).futurePickId;

    if (!isTradeAssetType(assetType)) {
      findings.push({
        code: "INVALID_ASSET_TYPE",
        severity: "error",
        message: `${side}[${index}].assetType must be PLAYER or PICK.`,
      });
      return;
    }

    if (assetType === "PLAYER") {
      if (typeof playerId !== "string" || playerId.trim().length === 0) {
        findings.push({
          code: "PLAYER_ID_REQUIRED",
          severity: "error",
          message: `${side}[${index}] requires playerId for PLAYER assets.`,
        });
        return;
      }

      assets.push({
        assetType,
        playerId: playerId.trim(),
        futurePickId: null,
      });
      return;
    }

    if (typeof futurePickId !== "string" || futurePickId.trim().length === 0) {
      findings.push({
        code: "PICK_ID_REQUIRED",
        severity: "error",
        message: `${side}[${index}] requires futurePickId for PICK assets.`,
      });
      return;
    }

    assets.push({
      assetType,
      playerId: null,
      futurePickId: futurePickId.trim(),
    });
  });

  return { findings, assets };
}

export function parseTradeRequest(body: TradeAnalyzeRequest): {
  request: ParsedTradeRequest | null;
  findings: TradeFinding[];
} {
  const findings: TradeFinding[] = [];
  const teamAId = typeof body.teamAId === "string" ? body.teamAId.trim() : "";
  const teamBId = typeof body.teamBId === "string" ? body.teamBId.trim() : "";
  const notesRaw = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!teamAId) {
    findings.push({
      code: "TEAM_A_REQUIRED",
      severity: "error",
      message: "teamAId is required.",
    });
  }

  if (!teamBId) {
    findings.push({
      code: "TEAM_B_REQUIRED",
      severity: "error",
      message: "teamBId is required.",
    });
  }

  if (teamAId && teamBId && teamAId === teamBId) {
    findings.push({
      code: "SAME_TEAM_NOT_ALLOWED",
      severity: "error",
      message: "teamAId and teamBId must be different.",
    });
  }

  const parsedA = parseAssetList(body.teamAAssets, "teamAAssets");
  const parsedB = parseAssetList(body.teamBAssets, "teamBAssets");
  findings.push(...parsedA.findings, ...parsedB.findings);

  if (findings.some((finding) => finding.severity === "error")) {
    return {
      request: null,
      findings,
    };
  }

  return {
    request: {
      teamAId,
      teamBId,
      teamAAssets: parsedA.assets,
      teamBAssets: parsedB.assets,
      notes: notesRaw.length > 0 ? notesRaw : null,
    },
    findings,
  };
}

async function loadTeamSnapshot(input: {
  seasonId: string;
  teamId: string;
}): Promise<TeamSnapshot> {
  const [rosterCount, contracts, penalties] = await Promise.all([
    prisma.rosterSlot.count({
      where: {
        seasonId: input.seasonId,
        teamId: input.teamId,
      },
    }),
    prisma.contract.aggregate({
      where: {
        seasonId: input.seasonId,
        teamId: input.teamId,
        status: {
          in: [...ACTIVE_CONTRACT_STATUSES],
        },
      },
      _sum: {
        salary: true,
      },
    }),
    prisma.capPenalty.aggregate({
      where: {
        seasonId: input.seasonId,
        teamId: input.teamId,
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const activeCap = contracts._sum.salary ?? 0;
  const deadCap = penalties._sum.amount ?? 0;

  return {
    rosterCount,
    activeCap,
    deadCap,
    totalCap: activeCap + deadCap,
  };
}

function pickLabel(input: {
  seasonYear: number;
  round: number;
  overall: number | null;
  originalTeamName: string;
  originalTeamAbbreviation: string | null;
}) {
  const suffix =
    input.originalTeamAbbreviation || input.originalTeamName
      ? ` (${input.originalTeamAbbreviation ?? input.originalTeamName})`
      : "";
  const overall = input.overall ? ` #${input.overall}` : "";
  return `${input.seasonYear} R${input.round}${overall}${suffix}`;
}

export async function analyzeTradeProposal(
  context: TradeAnalysisContext,
  request: ParsedTradeRequest,
): Promise<TradeAnalysisResult> {
  const findings: TradeFinding[] = [];

  const teams = await prisma.team.findMany({
    where: {
      leagueId: context.league.leagueId,
      id: {
        in: [request.teamAId, request.teamBId],
      },
    },
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  });

  const teamA = teams.find((team) => team.id === request.teamAId) ?? null;
  const teamB = teams.find((team) => team.id === request.teamBId) ?? null;

  if (!teamA) {
    findings.push({
      code: "TEAM_A_NOT_FOUND",
      severity: "error",
      message: "teamAId was not found in the active league.",
      context: {
        teamAId: request.teamAId,
      },
    });
  }

  if (!teamB) {
    findings.push({
      code: "TEAM_B_NOT_FOUND",
      severity: "error",
      message: "teamBId was not found in the active league.",
      context: {
        teamBId: request.teamBId,
      },
    });
  }

  if (context.seasonPhase === "PLAYOFFS") {
    findings.push({
      code: "TRADE_WINDOW_CLOSED",
      severity: "error",
      message: "Trades are closed during the playoffs phase.",
      context: {
        seasonPhase: context.seasonPhase,
      },
    });
  }

  const allAssets: TradeAssetSummary[] = [
    ...request.teamAAssets.map((asset) => ({
      assetType: asset.assetType,
      fromTeamId: request.teamAId,
      toTeamId: request.teamBId,
      playerId: asset.playerId,
      futurePickId: asset.futurePickId,
      label: asset.playerId ?? asset.futurePickId ?? "Unknown asset",
    })),
    ...request.teamBAssets.map((asset) => ({
      assetType: asset.assetType,
      fromTeamId: request.teamBId,
      toTeamId: request.teamAId,
      playerId: asset.playerId,
      futurePickId: asset.futurePickId,
      label: asset.playerId ?? asset.futurePickId ?? "Unknown asset",
    })),
  ];

  if (request.teamAAssets.length === 0 || request.teamBAssets.length === 0) {
    findings.push({
      code: "ASSET_PACKAGE_REQUIRED",
      severity: "error",
      message: "Both teams must send at least one asset.",
    });
  }

  const seenPlayerIds = new Set<string>();
  const seenPickIds = new Set<string>();

  for (const asset of allAssets) {
    if (asset.assetType === "PLAYER" && asset.playerId) {
      if (seenPlayerIds.has(asset.playerId)) {
        findings.push({
          code: "DUPLICATE_PLAYER_ASSET",
          severity: "error",
          message: "Duplicate player assets are not allowed in one trade package.",
          context: {
            playerId: asset.playerId,
          },
        });
      }
      seenPlayerIds.add(asset.playerId);
    }

    if (asset.assetType === "PICK" && asset.futurePickId) {
      if (seenPickIds.has(asset.futurePickId)) {
        findings.push({
          code: "DUPLICATE_PICK_ASSET",
          severity: "error",
          message: "Duplicate pick assets are not allowed in one trade package.",
          context: {
            futurePickId: asset.futurePickId,
          },
        });
      }
      seenPickIds.add(asset.futurePickId);
    }
  }

  const playerIds = allAssets
    .map((asset) => asset.playerId)
    .filter((value): value is string => Boolean(value));
  const futurePickIds = allAssets
    .map((asset) => asset.futurePickId)
    .filter((value): value is string => Boolean(value));

  const [players, picks, contracts, rosterSlots] = await Promise.all([
    playerIds.length > 0
      ? prisma.player.findMany({
          where: {
            id: {
              in: playerIds,
            },
          },
          select: {
            id: true,
            name: true,
          },
        })
      : Promise.resolve([]),
    futurePickIds.length > 0
      ? prisma.futurePick.findMany({
          where: {
            id: {
              in: futurePickIds,
            },
            leagueId: context.league.leagueId,
          },
          include: {
            originalTeam: {
              select: {
                name: true,
                abbreviation: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    playerIds.length > 0
      ? prisma.contract.findMany({
          where: {
            seasonId: context.league.seasonId,
            playerId: {
              in: playerIds,
            },
            status: {
              in: [...ACTIVE_CONTRACT_STATUSES],
            },
          },
          select: {
            playerId: true,
            teamId: true,
            salary: true,
          },
        })
      : Promise.resolve([]),
    playerIds.length > 0
      ? prisma.rosterSlot.findMany({
          where: {
            seasonId: context.league.seasonId,
            playerId: {
              in: playerIds,
            },
          },
          select: {
            playerId: true,
            teamId: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const playerById = new Map(players.map((player) => [player.id, player]));
  const pickById = new Map(picks.map((pick) => [pick.id, pick]));
  const contractByPlayerId = new Map(contracts.map((contract) => [contract.playerId, contract]));
  const rosterByPlayerId = new Map(rosterSlots.map((slot) => [slot.playerId, slot]));

  const capDeltaByTeam: Record<string, number> = {
    [request.teamAId]: 0,
    [request.teamBId]: 0,
  };
  const rosterDeltaByTeam: Record<string, number> = {
    [request.teamAId]: 0,
    [request.teamBId]: 0,
  };

  for (const asset of allAssets) {
    if (asset.assetType === "PLAYER" && asset.playerId) {
      const player = playerById.get(asset.playerId) ?? null;
      asset.label = player?.name ?? asset.playerId;

      if (!player) {
        findings.push({
          code: "PLAYER_NOT_FOUND",
          severity: "error",
          message: "Player asset was not found.",
          context: {
            playerId: asset.playerId,
          },
        });
        continue;
      }

      const contract = contractByPlayerId.get(asset.playerId) ?? null;
      const rosterSlot = rosterByPlayerId.get(asset.playerId) ?? null;

      if (!contract || contract.teamId !== asset.fromTeamId) {
        findings.push({
          code: "PLAYER_CONTRACT_OWNERSHIP_INVALID",
          severity: "error",
          message: "Player contract is not owned by the sending team.",
          context: {
            playerId: asset.playerId,
            fromTeamId: asset.fromTeamId,
            contractTeamId: contract?.teamId ?? null,
          },
        });
        continue;
      }

      if (!rosterSlot || rosterSlot.teamId !== asset.fromTeamId) {
        findings.push({
          code: "PLAYER_ROSTER_OWNERSHIP_INVALID",
          severity: "error",
          message: "Player roster assignment is not owned by the sending team.",
          context: {
            playerId: asset.playerId,
            fromTeamId: asset.fromTeamId,
            rosterTeamId: rosterSlot?.teamId ?? null,
          },
        });
        continue;
      }

      capDeltaByTeam[asset.fromTeamId] -= contract.salary;
      capDeltaByTeam[asset.toTeamId] += contract.salary;
      rosterDeltaByTeam[asset.fromTeamId] -= 1;
      rosterDeltaByTeam[asset.toTeamId] += 1;
      continue;
    }

    if (asset.assetType === "PICK" && asset.futurePickId) {
      const pick = pickById.get(asset.futurePickId) ?? null;

      if (!pick) {
        findings.push({
          code: "PICK_NOT_FOUND",
          severity: "error",
          message: "Pick asset was not found in the active league.",
          context: {
            futurePickId: asset.futurePickId,
          },
        });
        continue;
      }

      asset.label = pickLabel({
        seasonYear: pick.seasonYear,
        round: pick.round,
        overall: pick.overall,
        originalTeamName: pick.originalTeam.name,
        originalTeamAbbreviation: pick.originalTeam.abbreviation,
      });

      if (pick.currentTeamId !== asset.fromTeamId) {
        findings.push({
          code: "PICK_OWNERSHIP_INVALID",
          severity: "error",
          message: "Pick is not owned by the sending team.",
          context: {
            futurePickId: pick.id,
            fromTeamId: asset.fromTeamId,
            currentTeamId: pick.currentTeamId,
          },
        });
      }

      if (pick.isUsed) {
        findings.push({
          code: "PICK_ALREADY_USED",
          severity: "error",
          message: "Used picks cannot be traded.",
          context: {
            futurePickId: pick.id,
          },
        });
      }
    }
  }

  const [teamASnapshot, teamBSnapshot] = await Promise.all([
    loadTeamSnapshot({
      seasonId: context.league.seasonId,
      teamId: request.teamAId,
    }),
    loadTeamSnapshot({
      seasonId: context.league.seasonId,
      teamId: request.teamBId,
    }),
  ]);

  const buildImpact = (
    team: Pick<Team, "id" | "name"> | null,
    teamId: string,
    snapshot: TeamSnapshot,
  ): TradeTeamImpact | null => {
    if (!team) {
      return null;
    }

    const rosterDelta = rosterDeltaByTeam[teamId] ?? 0;
    const capDelta = capDeltaByTeam[teamId] ?? 0;
    return {
      teamId: team.id,
      teamName: team.name,
      rosterCountBefore: snapshot.rosterCount,
      rosterCountAfter: snapshot.rosterCount + rosterDelta,
      rosterDelta,
      totalCapBefore: snapshot.totalCap,
      totalCapAfter: snapshot.totalCap + capDelta,
      capDelta,
    };
  };

  const teamAImpact = buildImpact(teamA, request.teamAId, teamASnapshot);
  const teamBImpact = buildImpact(teamB, request.teamBId, teamBSnapshot);

  const rosterLimit = context.league.ruleset.rosterSize;
  const softCap = context.league.ruleset.salaryCapSoft;
  const hardCap = context.league.ruleset.salaryCapHard;

  const impacts = [teamAImpact, teamBImpact].filter((impact): impact is TradeTeamImpact =>
    Boolean(impact),
  );
  impacts.forEach((impact) => {
    if (impact.rosterCountAfter > rosterLimit) {
      findings.push({
        code: "POST_TRADE_ROSTER_LIMIT_EXCEEDED",
        severity: "error",
        message: `${impact.teamName} would exceed roster size limit (${rosterLimit}).`,
        context: {
          teamId: impact.teamId,
          rosterCountAfter: impact.rosterCountAfter,
          rosterLimit,
        },
      });
    }

    if (impact.totalCapAfter > hardCap) {
      findings.push({
        code: "POST_TRADE_HARD_CAP_EXCEEDED",
        severity: "error",
        message: `${impact.teamName} would exceed hard cap ($${hardCap}).`,
        context: {
          teamId: impact.teamId,
          totalCapAfter: impact.totalCapAfter,
          hardCap,
        },
      });
    } else if (impact.totalCapAfter > softCap) {
      findings.push({
        code: "POST_TRADE_SOFT_CAP_EXCEEDED",
        severity: "error",
        message: `${impact.teamName} would exceed soft cap ($${softCap}).`,
        context: {
          teamId: impact.teamId,
          totalCapAfter: impact.totalCapAfter,
          softCap,
        },
      });
    }
  });

  return {
    trade: {
      teamAId: request.teamAId,
      teamBId: request.teamBId,
      notes: request.notes,
    },
    legal: !findings.some((finding) => finding.severity === "error"),
    findings,
    assets: allAssets,
    impact: {
      teamA: teamAImpact,
      teamB: teamBImpact,
    },
  };
}

function toAssetLabel(asset: TradeWithIncludes["assets"][number]) {
  if (asset.assetType === "PLAYER") {
    return asset.player?.name ?? asset.playerId ?? "Unknown Player";
  }

  if (asset.futurePick) {
    return pickLabel({
      seasonYear: asset.futurePick.seasonYear,
      round: asset.futurePick.round,
      overall: asset.futurePick.overall,
      originalTeamName: asset.futurePick.originalTeam.name,
      originalTeamAbbreviation: asset.futurePick.originalTeam.abbreviation,
    });
  }

  return asset.futurePickId ?? "Unknown Pick";
}

export function toTradeSummary(trade: TradeWithIncludes): TradeSummary {
  return {
    id: trade.id,
    seasonId: trade.seasonId,
    teamA: {
      id: trade.teamA.id,
      name: trade.teamA.name,
      abbreviation: trade.teamA.abbreviation,
    },
    teamB: {
      id: trade.teamB.id,
      name: trade.teamB.name,
      abbreviation: trade.teamB.abbreviation,
    },
    status: trade.status,
    notes: trade.notes,
    proposedAt: trade.proposedAt.toISOString(),
    processedAt: trade.processedAt?.toISOString() ?? null,
    assets: trade.assets.map((asset) => ({
      assetType: asset.assetType,
      fromTeamId: asset.fromTeamId,
      toTeamId: asset.toTeamId,
      playerId: asset.playerId,
      futurePickId: asset.futurePickId,
      label: toAssetLabel(asset),
    })),
  };
}

export const tradeInclude = Prisma.validator<Prisma.TradeInclude>()({
  teamA: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  teamB: {
    select: {
      id: true,
      name: true,
      abbreviation: true,
    },
  },
  assets: {
    include: {
      player: {
        select: {
          id: true,
          name: true,
        },
      },
      futurePick: {
        include: {
          originalTeam: {
            select: {
              name: true,
              abbreviation: true,
            },
          },
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  },
});
