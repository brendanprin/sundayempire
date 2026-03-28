import type { Prisma, PrismaClient, RosterStatus, TransactionType } from "@prisma/client";
import {
  buildPlayerIdentityFingerprintKey,
  createPlayerIdentityResolver,
  type CanonicalPlayerIdentityRecord,
} from "@/lib/domain/player/player-identity-resolver";
import { prisma } from "@/lib/prisma";
import { CanonicalLeagueRole } from "@/lib/role-model";
import { createHostPlatformSyncJobRepository } from "@/lib/repositories/sync/host-platform-sync-job-repository";
import { createSyncMismatchRepository } from "@/lib/repositories/sync/sync-mismatch-repository";
import { getSyncProviderAdapter } from "@/lib/domain/sync/adapters/registry";
import type {
  NormalizedRosterImportRow,
  NormalizedTransactionImportRow,
  SyncRunRequestBody,
} from "@/lib/domain/sync/adapters/types";
import {
  buildSyncFingerprint,
  normalizeCode,
  normalizeImportedTransactionType,
  normalizeText,
  payloadDigest,
  rosterSnapshotForFingerprint,
  safeDateIso,
  serializeRosterImportRow,
  serializeTransactionImportRow,
  transactionSnapshotForFingerprint,
  type SyncDetection,
} from "@/lib/domain/sync/shared";
import { auditActorFromRequestActor, logTransaction } from "@/lib/transactions";

type SyncDbClient = PrismaClient | Prisma.TransactionClient;

type ResolvedTeam = {
  id: string;
  name: string;
  abbreviation: string | null;
};

type ResolvedPlayer = CanonicalPlayerIdentityRecord;

type ActiveAssignment = {
  id: string;
  teamId: string;
  seasonId: string;
  playerId: string;
  rosterStatus: RosterStatus;
  hostPlatformReferenceId: string | null;
  effectiveAt: Date;
  team: ResolvedTeam;
  player: ResolvedPlayer;
};

type ExistingTransaction = {
  id: string;
  type: TransactionType;
  summary: string;
  createdAt: Date;
  team: ResolvedTeam | null;
  player: ResolvedPlayer | null;
};

type PlayerResolver = ReturnType<typeof createPlayerIdentityResolver>;

type ImportedPlayerLookup = {
  playerSourceKey: string | null;
  playerSourcePlayerId: string | null;
  playerExternalId: string | null;
  playerName: string | null;
  position?: string | null;
  nflTeam?: string | null;
};

type SyncPlayerMatch = {
  resolutionStatus: "matched" | "unresolved" | "ambiguous" | "conflict";
  player: CanonicalPlayerIdentityRecord | null;
  strategy: string;
  confidence: "high" | "low" | "none";
  reason: string;
  fingerprintKey: string;
  candidatePlayerIds: string[];
  conflictingPlayerIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyRosterMissingInHostSeverity(status: RosterStatus) {
  if (status === "MIRRORED_ONLY") {
    return "WARNING" as const;
  }

  return "HIGH_IMPACT" as const;
}

function classifyRosterStatusDifferenceSeverity(input: {
  currentStatus: RosterStatus;
  hostStatus: RosterStatus;
}) {
  if (input.currentStatus === input.hostStatus) {
    return "INFO" as const;
  }

  if (
    input.currentStatus === "RELEASED" ||
    input.hostStatus === "RELEASED"
  ) {
    return "HIGH_IMPACT" as const;
  }

  return "WARNING" as const;
}

function classifyTransactionMissingInAppSeverity(type: TransactionType | null) {
  if (
    type &&
    [
      "ADD",
      "DROP",
      "WAIVER_ADD",
      "WAIVER_DROP",
      "TRADE_IN",
      "TRADE_OUT",
      "CONTRACT_CREATE",
      "CONTRACT_UPDATE",
      "CONTRACT_OPTION_EXERCISED",
      "FRANCHISE_TAG_APPLIED",
      "ROSTER_MOVE",
      "PICK_TRANSFER",
    ].includes(type)
  ) {
    return "HIGH_IMPACT" as const;
  }

  return "WARNING" as const;
}

function buildTeamResolvers(teams: ResolvedTeam[]) {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const byAbbreviation = new Map(
    teams
      .filter((team) => team.abbreviation)
      .map((team) => [normalizeCode(team.abbreviation), team]),
  );
  const byName = new Map(teams.map((team) => [normalizeText(team.name), team]));

  return {
    resolve(input: {
      teamId: string | null;
      teamAbbreviation: string | null;
      teamName: string | null;
    }) {
      if (input.teamId && byId.has(input.teamId)) {
        return byId.get(input.teamId) ?? null;
      }
      if (input.teamAbbreviation && byAbbreviation.has(normalizeCode(input.teamAbbreviation))) {
        return byAbbreviation.get(normalizeCode(input.teamAbbreviation)) ?? null;
      }
      if (input.teamName && byName.has(normalizeText(input.teamName))) {
        return byName.get(normalizeText(input.teamName)) ?? null;
      }
      return null;
    },
  };
}

function buildCanonicalPlayerIdentity(player: ResolvedPlayer): CanonicalPlayerIdentityRecord {
  return {
    id: player.id,
    name: player.name,
    displayName: player.displayName,
    searchName: player.searchName,
    position: player.position,
    nflTeam: player.nflTeam,
    externalId: player.externalId,
    sourceKey: player.sourceKey,
    sourcePlayerId: player.sourcePlayerId,
  };
}

function buildImportedPlayerIdentityLookup(input: ImportedPlayerLookup) {
  return {
    sourceKey: input.playerSourceKey,
    sourcePlayerId: input.playerSourcePlayerId,
    externalId: input.playerExternalId,
    name: input.playerName,
    position: input.position ?? null,
    nflTeam: input.nflTeam ?? null,
  };
}

function resolveImportedPlayerForSync(
  playerResolver: PlayerResolver,
  input: ImportedPlayerLookup,
): SyncPlayerMatch {
  const lookup = buildImportedPlayerIdentityLookup(input);
  const fingerprintKey = buildPlayerIdentityFingerprintKey(lookup);
  const resolution = playerResolver.resolve(lookup);

  if (resolution.status === "matched" && resolution.conflicts.length === 0) {
    return {
      resolutionStatus: "matched",
      player: resolution.player,
      strategy: resolution.strategy,
      confidence: resolution.confidence,
      reason: "Canonical player matched safely.",
      fingerprintKey,
      candidatePlayerIds: [resolution.player.id],
      conflictingPlayerIds: [],
    };
  }

  if (resolution.status === "matched") {
    return {
      resolutionStatus: "conflict",
      player: null,
      strategy: resolution.strategy,
      confidence: "low",
      reason:
        "Incoming player identity matched a canonical player but conflicted with another canonical identity.",
      fingerprintKey,
      candidatePlayerIds: [resolution.player.id, ...resolution.conflicts.map((player) => player.id)],
      conflictingPlayerIds: resolution.conflicts.map((player) => player.id),
    };
  }

  if (resolution.status === "ambiguous") {
    return {
      resolutionStatus: "ambiguous",
      player: null,
      strategy: resolution.strategy,
      confidence: resolution.confidence,
      reason: resolution.reason,
      fingerprintKey,
      candidatePlayerIds: resolution.candidates.map((player) => player.id),
      conflictingPlayerIds: [],
    };
  }

  return {
    resolutionStatus: "unresolved",
    player: null,
    strategy: resolution.strategy,
    confidence: resolution.confidence,
    reason: resolution.reason,
    fingerprintKey,
    candidatePlayerIds: [],
    conflictingPlayerIds: [],
  };
}

function buildImportedPlayerFingerprintKey(match: SyncPlayerMatch) {
  if (match.player) {
    return match.player.id;
  }

  return `import:${match.fingerprintKey}`;
}

function buildStoredTransactionPlayerKey(player: ResolvedPlayer | null | undefined) {
  return player?.id ?? null;
}

function buildRosterDetections(input: {
  seasonId: string;
  rows: NormalizedRosterImportRow[];
  assignments: ActiveAssignment[];
  teams: ResolvedTeam[];
  playerResolver: PlayerResolver;
}): SyncDetection[] {
  const detections: SyncDetection[] = [];
  const teamResolver = buildTeamResolvers(input.teams);

  const activeAssignmentByPlayerId = new Map(
    input.assignments.map((assignment) => [assignment.playerId, assignment]),
  );
  const activeAssignmentByHostRef = new Map(
    input.assignments
      .filter((assignment) => assignment.hostPlatformReferenceId)
      .map((assignment) => [assignment.hostPlatformReferenceId!, assignment]),
  );
  const matchedAssignmentIds = new Set<string>();

  for (const row of input.rows) {
    const team = teamResolver.resolve({
      teamId: row.teamId,
      teamAbbreviation: row.teamAbbreviation,
      teamName: row.teamName,
    });
    const playerMatch = resolveImportedPlayerForSync(input.playerResolver, {
      playerSourceKey: row.playerSourceKey,
      playerSourcePlayerId: row.playerSourcePlayerId,
      playerExternalId: row.playerExternalId,
      playerName: row.playerName,
      position: row.position,
    });
    const player = playerMatch.player;
    const assignment =
      (row.hostPlatformReferenceId
        ? activeAssignmentByHostRef.get(row.hostPlatformReferenceId)
        : null) ??
      (player ? activeAssignmentByPlayerId.get(player.id) : null) ??
      null;

    if (!player) {
      const mismatchReason =
        playerMatch.resolutionStatus === "ambiguous"
          ? "player_ambiguous"
          : playerMatch.resolutionStatus === "conflict"
            ? "player_identity_conflict"
            : "player_unresolved";

      detections.push({
        domain: "roster",
        mismatchType: "ROSTER_MISSING_IN_APP",
        severity: "WARNING",
        fingerprint: buildSyncFingerprint({
          seasonId: input.seasonId,
          domain: "roster",
          snapshot: rosterSnapshotForFingerprint({
            playerKey: buildImportedPlayerFingerprintKey(playerMatch),
            teamKey: team?.id ?? row.teamId ?? normalizeText(row.teamName),
            rosterStatus: row.rosterStatus,
            hostPlatformReferenceId: row.hostPlatformReferenceId,
          }),
        }),
        title: "Host roster player could not be mapped",
        message:
          playerMatch.resolutionStatus === "ambiguous"
            ? `${row.playerName} matched multiple Dynasty players and requires review before sync can compare it safely.`
            : `${row.playerName} could not be matched to a Dynasty player record with sufficient confidence.`,
        teamId: team?.id ?? null,
        hostPlatformReferenceId: row.hostPlatformReferenceId,
        hostValue: serializeRosterImportRow(row),
        dynastyValue: null,
        metadata: {
          reason: mismatchReason,
          matchStrategy: playerMatch.strategy,
          confidence: playerMatch.confidence,
          candidatePlayerIds: playerMatch.candidatePlayerIds,
          conflictingPlayerIds: playerMatch.conflictingPlayerIds,
          resolutionReason: playerMatch.reason,
          playerIdentityKey: playerMatch.fingerprintKey,
        },
      });
      continue;
    }

    if (!assignment) {
      detections.push({
        domain: "roster",
        mismatchType: "ROSTER_MISSING_IN_APP",
        severity: "HIGH_IMPACT",
        fingerprint: buildSyncFingerprint({
          seasonId: input.seasonId,
          domain: "roster",
          snapshot: rosterSnapshotForFingerprint({
            playerKey: player.id,
            teamKey: team?.id ?? row.teamId ?? normalizeText(row.teamName),
            rosterStatus: row.rosterStatus,
            hostPlatformReferenceId: row.hostPlatformReferenceId,
          }),
        }),
        title: "Host roster entry is missing in Dynasty",
        message: `${player.name} appears on the host roster snapshot but has no active Dynasty roster assignment.`,
        teamId: team?.id ?? null,
        playerId: player.id,
        hostPlatformReferenceId: row.hostPlatformReferenceId,
        hostValue: serializeRosterImportRow(row),
        dynastyValue: null,
        metadata: {
          reason: "no_active_assignment",
          resolvedPlayerName: player.name,
          matchStrategy: playerMatch.strategy,
        },
      });
      continue;
    }

    matchedAssignmentIds.add(assignment.id);

    if (team && assignment.teamId !== team.id) {
      detections.push({
        domain: "roster",
        mismatchType: "ROSTER_TEAM_DIFFERENCE",
        severity: "HIGH_IMPACT",
        fingerprint: buildSyncFingerprint({
          seasonId: input.seasonId,
          domain: "roster",
          snapshot: rosterSnapshotForFingerprint({
            playerKey: player.id,
            teamKey: team.id,
            rosterStatus: row.rosterStatus,
            hostPlatformReferenceId: row.hostPlatformReferenceId ?? assignment.hostPlatformReferenceId,
          }),
        }),
        title: "Roster team differs from host platform",
        message: `${player.name} is assigned to ${assignment.team.name} in Dynasty but ${team.name} in the host snapshot.`,
        teamId: team.id,
        playerId: player.id,
        rosterAssignmentId: assignment.id,
        hostPlatformReferenceId: row.hostPlatformReferenceId ?? assignment.hostPlatformReferenceId,
        hostValue: {
          ...serializeRosterImportRow(row),
          resolvedTeam: team,
          resolvedPlayer: player,
        },
        dynastyValue: {
          rosterAssignmentId: assignment.id,
          teamId: assignment.team.id,
          teamName: assignment.team.name,
          rosterStatus: assignment.rosterStatus,
          hostPlatformReferenceId: assignment.hostPlatformReferenceId,
          effectiveAt: safeDateIso(assignment.effectiveAt),
        },
        metadata: {
          reason: "team_difference",
          expectedTeamId: team.id,
          currentTeamId: assignment.team.id,
          matchStrategy: playerMatch.strategy,
        },
      });
      continue;
    }

    if (assignment.rosterStatus !== row.rosterStatus) {
      detections.push({
        domain: "roster",
        mismatchType: "ROSTER_STATUS_DIFFERENCE",
        severity: classifyRosterStatusDifferenceSeverity({
          currentStatus: assignment.rosterStatus,
          hostStatus: row.rosterStatus,
        }),
        fingerprint: buildSyncFingerprint({
          seasonId: input.seasonId,
          domain: "roster",
          snapshot: rosterSnapshotForFingerprint({
            playerKey: player.id,
            teamKey: assignment.team.id,
            rosterStatus: row.rosterStatus,
            hostPlatformReferenceId: row.hostPlatformReferenceId ?? assignment.hostPlatformReferenceId,
          }),
        }),
        title: "Roster status differs from host platform",
        message: `${player.name} is ${assignment.rosterStatus.toLowerCase()} in Dynasty but ${row.rosterStatus.toLowerCase()} in the host snapshot.`,
        teamId: assignment.team.id,
        playerId: player.id,
        rosterAssignmentId: assignment.id,
        hostPlatformReferenceId: row.hostPlatformReferenceId ?? assignment.hostPlatformReferenceId,
        hostValue: {
          ...serializeRosterImportRow(row),
          resolvedPlayer: player,
        },
        dynastyValue: {
          rosterAssignmentId: assignment.id,
          teamId: assignment.team.id,
          teamName: assignment.team.name,
          rosterStatus: assignment.rosterStatus,
          hostPlatformReferenceId: assignment.hostPlatformReferenceId,
        },
        metadata: {
          reason: "status_difference",
          matchStrategy: playerMatch.strategy,
        },
      });
    }
  }

  for (const assignment of input.assignments) {
    if (matchedAssignmentIds.has(assignment.id)) {
      continue;
    }

    detections.push({
      domain: "roster",
      mismatchType: "ROSTER_MISSING_IN_HOST",
      severity: classifyRosterMissingInHostSeverity(assignment.rosterStatus),
      fingerprint: buildSyncFingerprint({
        seasonId: input.seasonId,
        domain: "roster",
        snapshot: rosterSnapshotForFingerprint({
          playerKey: assignment.player.id,
          teamKey: assignment.team.id,
          rosterStatus: assignment.rosterStatus,
          hostPlatformReferenceId: assignment.hostPlatformReferenceId,
        }),
      }),
      title: "Dynasty roster entry is missing in host snapshot",
      message: `${assignment.player.name} has an active Dynasty roster assignment on ${assignment.team.name} but was not present in the host snapshot.`,
      teamId: assignment.team.id,
      playerId: assignment.player.id,
      rosterAssignmentId: assignment.id,
      hostPlatformReferenceId: assignment.hostPlatformReferenceId,
      hostValue: null,
      dynastyValue: {
        rosterAssignmentId: assignment.id,
        teamId: assignment.team.id,
        teamName: assignment.team.name,
        rosterStatus: assignment.rosterStatus,
        hostPlatformReferenceId: assignment.hostPlatformReferenceId,
        effectiveAt: safeDateIso(assignment.effectiveAt),
      },
      metadata: {
        reason: "missing_in_host_snapshot",
      },
    });
  }

  return detections;
}

function buildTransactionDetections(input: {
  seasonId: string;
  rows: NormalizedTransactionImportRow[];
  transactions: ExistingTransaction[];
  playerResolver: PlayerResolver;
}): SyncDetection[] {
  const detections: SyncDetection[] = [];

  const byExactKey = new Map<string, ExistingTransaction>();
  const byPlayerType = new Map<string, ExistingTransaction[]>();
  const byTeamType = new Map<string, ExistingTransaction[]>();

  for (const transaction of input.transactions) {
    byExactKey.set(
      buildSyncFingerprint({
        seasonId: input.seasonId,
        domain: "transactions",
        snapshot: transactionSnapshotForFingerprint({
          typeKey: normalizeImportedTransactionType(transaction.type),
          summary: transaction.summary,
          teamKey: transaction.team?.id ?? normalizeText(transaction.team?.name),
          playerKey:
            buildStoredTransactionPlayerKey(transaction.player) ??
            normalizeText(transaction.player?.name),
        }),
      }),
      transaction,
    );

    const playerTypeKey = `${normalizeImportedTransactionType(transaction.type) ?? "UNKNOWN"}::${buildStoredTransactionPlayerKey(transaction.player) ?? normalizeText(transaction.player?.name)}`;
    const teamTypeKey = `${normalizeImportedTransactionType(transaction.type) ?? "UNKNOWN"}::${transaction.team?.id ?? normalizeText(transaction.team?.name)}`;
    byPlayerType.set(playerTypeKey, [...(byPlayerType.get(playerTypeKey) ?? []), transaction]);
    byTeamType.set(teamTypeKey, [...(byTeamType.get(teamTypeKey) ?? []), transaction]);
  }

  for (const row of input.rows) {
    const playerMatch = resolveImportedPlayerForSync(input.playerResolver, {
      playerSourceKey: row.playerSourceKey,
      playerSourcePlayerId: row.playerSourcePlayerId,
      playerExternalId: row.playerExternalId,
      playerName: row.playerName,
    });
    const matchedPlayer = playerMatch.player;
    const exactFingerprint = buildSyncFingerprint({
      seasonId: input.seasonId,
      domain: "transactions",
      snapshot: transactionSnapshotForFingerprint({
        typeKey: normalizeImportedTransactionType(row.transactionType ?? row.rawTransactionType),
        summary: row.summary,
        teamKey: row.teamId ?? normalizeText(row.teamName),
        playerKey: buildImportedPlayerFingerprintKey(playerMatch),
      }),
    });

    if (byExactKey.has(exactFingerprint)) {
      continue;
    }

    const playerTypeKey = matchedPlayer
      ? `${normalizeImportedTransactionType(row.transactionType ?? row.rawTransactionType) ?? "UNKNOWN"}::${matchedPlayer.id}`
      : null;
    const teamTypeKey = `${normalizeImportedTransactionType(row.transactionType ?? row.rawTransactionType) ?? "UNKNOWN"}::${row.teamId ?? normalizeText(row.teamName)}`;
    const playerCandidates = playerTypeKey ? byPlayerType.get(playerTypeKey) ?? [] : [];
    const teamCandidates = byTeamType.get(teamTypeKey) ?? [];

    const teamDifferenceCandidate = playerCandidates.find((candidate) => {
      const importedTeamKey = row.teamId ?? normalizeText(row.teamName);
      const existingTeamKey = candidate.team?.id ?? normalizeText(candidate.team?.name);
      return Boolean(importedTeamKey) && Boolean(existingTeamKey) && importedTeamKey !== existingTeamKey;
    });

    if (teamDifferenceCandidate) {
      detections.push({
        domain: "transactions",
        mismatchType: "TRANSACTION_TEAM_DIFFERENCE",
        severity: "HIGH_IMPACT",
        fingerprint: exactFingerprint,
        title: "Transaction team context differs",
        message: `Imported transaction "${row.summary}" maps to a different team than the Dynasty transaction log.`,
        teamId: teamDifferenceCandidate.team?.id ?? null,
        playerId: teamDifferenceCandidate.player?.id ?? null,
        hostValue: serializeTransactionImportRow(row),
        dynastyValue: {
          id: teamDifferenceCandidate.id,
          type: teamDifferenceCandidate.type,
          summary: teamDifferenceCandidate.summary,
          createdAt: safeDateIso(teamDifferenceCandidate.createdAt),
          teamId: teamDifferenceCandidate.team?.id ?? null,
          teamName: teamDifferenceCandidate.team?.name ?? null,
          playerId: teamDifferenceCandidate.player?.id ?? null,
          playerName: teamDifferenceCandidate.player?.name ?? null,
        },
        metadata: {
          reason: "transaction_team_difference",
        },
      });
      continue;
    }

    const summaryDifferenceCandidate = teamCandidates.find((candidate) => {
      return Boolean(matchedPlayer) && candidate.player?.id === matchedPlayer?.id;
    });

    if (summaryDifferenceCandidate) {
      detections.push({
        domain: "transactions",
        mismatchType: "TRANSACTION_SUMMARY_DIFFERENCE",
        severity: "INFO",
        fingerprint: exactFingerprint,
        title: "Transaction summary differs",
        message: `Imported transaction summary for ${row.summary} does not match the Dynasty transaction log.`,
        teamId: summaryDifferenceCandidate.team?.id ?? null,
        playerId: summaryDifferenceCandidate.player?.id ?? null,
        hostValue: serializeTransactionImportRow(row),
        dynastyValue: {
          id: summaryDifferenceCandidate.id,
          type: summaryDifferenceCandidate.type,
          summary: summaryDifferenceCandidate.summary,
          createdAt: safeDateIso(summaryDifferenceCandidate.createdAt),
          teamId: summaryDifferenceCandidate.team?.id ?? null,
          teamName: summaryDifferenceCandidate.team?.name ?? null,
          playerId: summaryDifferenceCandidate.player?.id ?? null,
          playerName: summaryDifferenceCandidate.player?.name ?? null,
        },
        metadata: {
          reason: "transaction_summary_difference",
          matchStrategy: playerMatch.strategy,
        },
      });
      continue;
    }

    const mismatchReason =
      playerMatch.resolutionStatus === "ambiguous"
        ? "transaction_player_ambiguous"
        : playerMatch.resolutionStatus === "conflict"
          ? "transaction_player_identity_conflict"
          : "transaction_missing_in_app";

    detections.push({
      domain: "transactions",
      mismatchType: "TRANSACTION_MISSING_IN_APP",
      severity: classifyTransactionMissingInAppSeverity(row.transactionType),
      fingerprint: exactFingerprint,
      title: "Imported transaction is missing in Dynasty",
      message:
        playerMatch.player || playerMatch.resolutionStatus === "matched"
          ? `Imported transaction "${row.summary}" could not be matched to a Dynasty transaction log entry.`
          : `Imported transaction "${row.summary}" could not be matched safely because its player identity requires review.`,
      hostValue: serializeTransactionImportRow(row),
      dynastyValue: null,
      metadata: {
        reason: mismatchReason,
        matchStrategy: playerMatch.strategy,
        confidence: playerMatch.confidence,
        candidatePlayerIds: playerMatch.candidatePlayerIds,
        conflictingPlayerIds: playerMatch.conflictingPlayerIds,
        resolutionReason: playerMatch.reason,
        playerIdentityKey: playerMatch.fingerprintKey,
      },
    });
  }

  return detections;
}

export type SyncRunResult = {
  job: {
    id: string;
    jobType: string;
    status: string;
    adapterKey: string;
    createdAt: string;
    completedAt: string | null;
  };
  summary: {
    created: number;
    updated: number;
    resolved: number;
    totalOpen: number;
    totalDetected: number;
    warnings: string[];
    errors: string[];
    domains: {
      rosterImported: number;
      transactionsImported: number;
    };
  };
};

export function createSyncRunService(client: SyncDbClient = prisma) {
  const jobRepository = createHostPlatformSyncJobRepository(client);
  const mismatchRepository = createSyncMismatchRepository(client);

  return {
    async run(input: {
      leagueId: string;
      seasonId: string;
      requestedByUserId?: string | null;
      actor?: {
        email: string;
        leagueRole: CanonicalLeagueRole;
        teamId: string | null;
      } | null;
      body: SyncRunRequestBody;
      now?: Date;
    }): Promise<SyncRunResult> {
      const now = input.now ?? new Date();
      const adapter = getSyncProviderAdapter(
        typeof input.body.adapterKey === "string" ? input.body.adapterKey : null,
      );

      if (!adapter) {
        throw new Error("INVALID_SYNC_ADAPTER");
      }

      const parsed = adapter.parse({
        sourceLabel:
          typeof input.body.sourceLabel === "string" && input.body.sourceLabel.trim().length > 0
            ? input.body.sourceLabel.trim()
            : null,
        roster: isRecord(input.body.roster) ? input.body.roster : null,
        transactions: isRecord(input.body.transactions) ? input.body.transactions : null,
      });

      if (!parsed.roster && !parsed.transactions) {
        throw new Error("SYNC_IMPORT_REQUIRED");
      }

      const requestErrors = [
        parsed.roster?.requestError,
        parsed.transactions?.requestError,
      ].filter((value): value is string => typeof value === "string" && value.length > 0);
      if (requestErrors.length > 0) {
        throw new Error(requestErrors.join(" "));
      }

      const jobType =
        parsed.roster && parsed.transactions
          ? "FULL_SYNC"
          : parsed.roster
            ? "ROSTER_IMPORT"
            : "TRANSACTION_IMPORT";

      const job = await jobRepository.create({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        requestedByUserId: input.requestedByUserId ?? null,
        jobType,
        status: "RUNNING",
        trigger: "MANUAL",
        adapterKey: adapter.key,
        sourceLabel: parsed.sourceLabel,
        startedAt: now,
        payloadDigest: payloadDigest({
          adapterKey: adapter.key,
          roster: parsed.roster?.rows.map(serializeRosterImportRow) ?? null,
          transactions: parsed.transactions?.rows.map(serializeTransactionImportRow) ?? null,
        }),
        inputJson: {
          sourceLabel: parsed.sourceLabel,
          capabilities: parsed.capabilities,
          roster: parsed.roster
            ? {
                format: parsed.roster.format,
                rowCount: parsed.roster.rows.length,
                errors: parsed.roster.errors,
              }
            : null,
          transactions: parsed.transactions
            ? {
                format: parsed.transactions.format,
                rowCount: parsed.transactions.rows.length,
                errors: parsed.transactions.errors,
              }
            : null,
        } as Prisma.InputJsonValue,
      });

      const [teams, players, approvedMappings, assignments, transactions] = await Promise.all([
        client.team.findMany({
          where: {
            leagueId: input.leagueId,
          },
          select: {
            id: true,
            name: true,
            abbreviation: true,
          },
        }),
        client.player.findMany({
          select: {
            id: true,
            name: true,
            displayName: true,
            searchName: true,
            nflTeam: true,
            externalId: true,
            sourceKey: true,
            sourcePlayerId: true,
            position: true,
          },
        }),
        client.playerIdentityMapping.findMany({
          select: {
            playerId: true,
            sourceKey: true,
            sourcePlayerId: true,
          },
        }),
        client.rosterAssignment.findMany({
          where: {
            seasonId: input.seasonId,
            endedAt: null,
          },
          orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            teamId: true,
            seasonId: true,
            playerId: true,
            rosterStatus: true,
            hostPlatformReferenceId: true,
            effectiveAt: true,
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
                displayName: true,
                searchName: true,
                nflTeam: true,
                externalId: true,
                sourceKey: true,
                sourcePlayerId: true,
                position: true,
              },
            },
          },
        }),
        client.transaction.findMany({
          where: {
            leagueId: input.leagueId,
            seasonId: input.seasonId,
          },
          select: {
            id: true,
            type: true,
            summary: true,
            createdAt: true,
            team: {
              select: {
                id: true,
                name: true,
                abbreviation: true,
              },
            },
            player: {
              select: {
                id: true,
                name: true,
                displayName: true,
                searchName: true,
                nflTeam: true,
                externalId: true,
                sourceKey: true,
                sourcePlayerId: true,
                position: true,
              },
            },
          },
          orderBy: [{ createdAt: "desc" }],
        }),
      ]);

      const playerResolver = createPlayerIdentityResolver({
        players: players.map((player) => buildCanonicalPlayerIdentity(player as ResolvedPlayer)),
        approvedMappings,
      });

      const detections: SyncDetection[] = [
        ...(parsed.roster
          ? buildRosterDetections({
              seasonId: input.seasonId,
              rows: parsed.roster.rows,
              assignments: assignments as ActiveAssignment[],
              teams,
              playerResolver,
            })
          : []),
        ...(parsed.transactions
          ? buildTransactionDetections({
              seasonId: input.seasonId,
              rows: parsed.transactions.rows,
              transactions: transactions as ExistingTransaction[],
              playerResolver,
            })
          : []),
      ];

      const counts = {
        created: 0,
        updated: 0,
        resolved: 0,
      };
      const seenFingerprints = new Set<string>();

      for (const detection of detections) {
        seenFingerprints.add(detection.fingerprint);
        const existing = await mismatchRepository.findOpenByFingerprint({
          leagueId: input.leagueId,
          fingerprint: detection.fingerprint,
        });

        if (existing) {
          await mismatchRepository.update(existing.id, {
            teamId: detection.teamId ?? null,
            playerId: detection.playerId ?? null,
            rosterAssignmentId: detection.rosterAssignmentId ?? null,
            mismatchType: detection.mismatchType,
            severity: detection.severity,
            status: "OPEN",
            resolutionType: null,
            title: detection.title,
            message: detection.message,
            hostPlatformReferenceId: detection.hostPlatformReferenceId ?? null,
            hostValueJson: detection.hostValue as Prisma.InputJsonValue | null,
            dynastyValueJson: detection.dynastyValue as Prisma.InputJsonValue | null,
            metadataJson: detection.metadata as Prisma.InputJsonValue | null,
            detectionCount: existing.detectionCount + 1,
            lastDetectedAt: now,
            resolvedAt: null,
            resolvedByUserId: null,
            resolutionReason: null,
          });
          counts.updated += 1;
          continue;
        }

        await mismatchRepository.create({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          jobId: job.id,
          teamId: detection.teamId ?? null,
          playerId: detection.playerId ?? null,
          rosterAssignmentId: detection.rosterAssignmentId ?? null,
          mismatchType: detection.mismatchType,
          severity: detection.severity,
          status: "OPEN",
          fingerprint: detection.fingerprint,
          title: detection.title,
          message: detection.message,
          hostPlatformReferenceId: detection.hostPlatformReferenceId ?? null,
          hostValueJson: detection.hostValue as Prisma.InputJsonValue | null,
          dynastyValueJson: detection.dynastyValue as Prisma.InputJsonValue | null,
          metadataJson: detection.metadata as Prisma.InputJsonValue | null,
          firstDetectedAt: now,
          lastDetectedAt: now,
        });
        counts.created += 1;
      }

      const staleMismatchTypes = [
        ...(parsed.roster
          ? ([
              "ROSTER_MISSING_IN_APP",
              "ROSTER_MISSING_IN_HOST",
              "ROSTER_TEAM_DIFFERENCE",
              "ROSTER_STATUS_DIFFERENCE",
            ] as const)
          : []),
        ...(parsed.transactions
          ? ([
              "TRANSACTION_MISSING_IN_APP",
              "TRANSACTION_TEAM_DIFFERENCE",
              "TRANSACTION_SUMMARY_DIFFERENCE",
            ] as const)
          : []),
      ];

      if (staleMismatchTypes.length > 0) {
        const openMismatches = await mismatchRepository.listForLeague({
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          statuses: ["OPEN"],
          mismatchTypes: [...staleMismatchTypes],
        });

        for (const mismatch of openMismatches) {
          if (seenFingerprints.has(mismatch.fingerprint)) {
            continue;
          }

          await mismatchRepository.update(mismatch.id, {
            status: "RESOLVED",
            resolvedAt: now,
            resolutionReason: "No longer detected by the latest sync run.",
          });
          counts.resolved += 1;
        }
      }

      const openAfterRun = await mismatchRepository.listForLeague({
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        statuses: ["OPEN", "ESCALATED"],
      });

      const errors = [
        ...(parsed.roster?.errors ?? []),
        ...(parsed.transactions?.errors ?? []),
      ];
      const warnings = parsed.warnings;

      const status =
        errors.length > 0
          ? counts.created + counts.updated + counts.resolved > 0
            ? "PARTIAL"
            : "FAILED"
          : "SUCCEEDED";

      const summaryJson = {
        created: counts.created,
        updated: counts.updated,
        resolved: counts.resolved,
        totalOpen: openAfterRun.length,
        totalDetected: detections.length,
        warnings,
        errors,
        domains: {
          rosterImported: parsed.roster?.rows.length ?? 0,
          transactionsImported: parsed.transactions?.rows.length ?? 0,
        },
      } as Prisma.InputJsonValue;

      await jobRepository.update(job.id, {
        status,
        completedAt: new Date(),
        summaryJson,
        errorJson:
          errors.length > 0
            ? ({
                messages: errors,
              } as Prisma.InputJsonValue)
            : null,
      });

      await logTransaction(client, {
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        type: "COMMISSIONER_OVERRIDE",
        summary: `Ran host platform sync (${jobType.replace(/_/g, " ").toLowerCase()}).`,
        metadata: {
          jobId: job.id,
          adapterKey: adapter.key,
          summary: summaryJson,
        },
        audit: {
          actor: auditActorFromRequestActor(input.actor ?? null),
          source: "sync.run",
          entities: {
            syncJobId: job.id,
          },
        },
      });

      return {
        job: {
          id: job.id,
          jobType,
          status,
          adapterKey: adapter.key,
          createdAt: job.createdAt.toISOString(),
          completedAt: new Date().toISOString(),
        },
        summary: {
          created: counts.created,
          updated: counts.updated,
          resolved: counts.resolved,
          totalOpen: openAfterRun.length,
          totalDetected: detections.length,
          warnings,
          errors,
          domains: {
            rosterImported: parsed.roster?.rows.length ?? 0,
            transactionsImported: parsed.transactions?.rows.length ?? 0,
          },
        },
      };
    },
  };
}
