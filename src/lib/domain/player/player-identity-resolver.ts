import {
  normalizeNflTeam,
  normalizePlayerSearchName,
  normalizePlayerSourceId,
  normalizePlayerSourceKey,
} from "@/lib/domain/player/normalization";

export type CanonicalPlayerIdentityRecord = {
  id: string;
  name: string;
  displayName: string;
  searchName: string;
  position: string;
  nflTeam: string | null;
  externalId: string | null;
  sourceKey: string | null;
  sourcePlayerId: string | null;
};

export type ApprovedPlayerIdentityMappingRecord = {
  playerId: string;
  sourceKey: string;
  sourcePlayerId: string;
};

export type PlayerIdentityLookupInput = {
  sourceKey?: string | null;
  sourcePlayerId?: string | null;
  externalId?: string | null;
  name?: string | null;
  displayName?: string | null;
  position?: string | null;
  nflTeam?: string | null;
};

export type PlayerIdentityMatchStrategy =
  | "source_identity"
  | "approved_mapping"
  | "legacy_external_id"
  | "exact_name_position_team"
  | "exact_name_position";

type NormalizedLookupInput = {
  sourceKey: string | null;
  sourcePlayerId: string | null;
  externalId: string | null;
  searchName: string;
  position: string | null;
  nflTeam: string | null;
};

export type PlayerIdentityResolution =
  | {
      status: "matched";
      strategy: PlayerIdentityMatchStrategy;
      confidence: "high";
      player: CanonicalPlayerIdentityRecord;
      normalized: NormalizedLookupInput;
      conflicts: CanonicalPlayerIdentityRecord[];
    }
  | {
      status: "ambiguous";
      strategy: "exact_name_position_team" | "exact_name_position";
      confidence: "low";
      normalized: NormalizedLookupInput;
      candidates: CanonicalPlayerIdentityRecord[];
      reason: string;
    }
  | {
      status: "unresolved";
      strategy: "none" | "legacy_external_id" | "exact_name_position_team" | "exact_name_position";
      confidence: "none" | "low";
      normalized: NormalizedLookupInput;
      candidates: CanonicalPlayerIdentityRecord[];
      reason: string;
    };

function sourceIdentityKey(input: {
  sourceKey: string | null | undefined;
  sourcePlayerId: string | null | undefined;
}) {
  const sourceKey = normalizePlayerSourceKey(input.sourceKey);
  const sourcePlayerId = normalizePlayerSourceId(input.sourcePlayerId);
  return sourceKey && sourcePlayerId ? `${sourceKey}::${sourcePlayerId}` : null;
}

function namePositionKey(input: { searchName: string; position: string | null | undefined }) {
  const position = (input.position ?? "").trim().toUpperCase();
  return input.searchName && position ? `${input.searchName}::${position}` : null;
}

function namePositionTeamKey(input: {
  searchName: string;
  position: string | null | undefined;
  nflTeam: string | null | undefined;
}) {
  const positionKey = namePositionKey(input);
  const team = normalizeNflTeam(input.nflTeam);
  return positionKey && team ? `${positionKey}::${team}` : null;
}

function normalizeLookupInput(input: PlayerIdentityLookupInput): NormalizedLookupInput {
  return {
    sourceKey: normalizePlayerSourceKey(input.sourceKey),
    sourcePlayerId: normalizePlayerSourceId(input.sourcePlayerId),
    externalId: normalizePlayerSourceId(input.externalId),
    searchName: normalizePlayerSearchName(input.displayName ?? input.name),
    position: (input.position ?? "").trim().toUpperCase() || null,
    nflTeam: normalizeNflTeam(input.nflTeam),
  };
}

function uniqById(players: CanonicalPlayerIdentityRecord[]) {
  const seen = new Set<string>();
  const unique: CanonicalPlayerIdentityRecord[] = [];

  for (const player of players) {
    if (seen.has(player.id)) {
      continue;
    }
    seen.add(player.id);
    unique.push(player);
  }

  return unique;
}

export function buildPlayerIdentityFingerprintKey(input: PlayerIdentityLookupInput) {
  const normalized = normalizeLookupInput(input);
  const sourceKey = sourceIdentityKey(normalized);
  if (sourceKey) {
    return `source:${sourceKey}`;
  }

  if (normalized.externalId) {
    return `external:${normalized.externalId}`;
  }

  const nameTeamKey = namePositionTeamKey(normalized);
  if (nameTeamKey) {
    return `name-position-team:${nameTeamKey}`;
  }

  const nameKey = namePositionKey(normalized);
  if (nameKey) {
    return `name-position:${nameKey}`;
  }

  return `unresolved:${normalized.searchName || "unknown"}:${normalized.position ?? "UNKNOWN"}`;
}

export function createPlayerIdentityResolver(input: {
  players: CanonicalPlayerIdentityRecord[];
  approvedMappings?: ApprovedPlayerIdentityMappingRecord[];
}) {
  const playerById = new Map(input.players.map((player) => [player.id, player]));
  const byPrimarySource = new Map<string, CanonicalPlayerIdentityRecord>();
  const byApprovedMapping = new Map<string, CanonicalPlayerIdentityRecord>();
  const byExternalId = new Map<string, CanonicalPlayerIdentityRecord>();
  const byNamePositionTeam = new Map<string, CanonicalPlayerIdentityRecord[]>();
  const byNamePosition = new Map<string, CanonicalPlayerIdentityRecord[]>();

  for (const player of input.players) {
    const primarySourceKey = sourceIdentityKey(player);
    if (primarySourceKey) {
      byPrimarySource.set(primarySourceKey, player);
    }

    if (player.externalId) {
      byExternalId.set(player.externalId, player);
    }

    const teamKey = namePositionTeamKey(player);
    if (teamKey) {
      byNamePositionTeam.set(teamKey, [...(byNamePositionTeam.get(teamKey) ?? []), player]);
    }

    const positionKey = namePositionKey(player);
    if (positionKey) {
      byNamePosition.set(positionKey, [...(byNamePosition.get(positionKey) ?? []), player]);
    }
  }

  for (const mapping of input.approvedMappings ?? []) {
    const mappingKey = sourceIdentityKey(mapping);
    const player = playerById.get(mapping.playerId);
    if (!mappingKey || !player) {
      continue;
    }

    byApprovedMapping.set(mappingKey, player);
  }

  function findConflicts(
    matchedPlayer: CanonicalPlayerIdentityRecord,
    normalized: NormalizedLookupInput,
  ) {
    const conflicts: CanonicalPlayerIdentityRecord[] = [];

    if (normalized.externalId) {
      const externalMatch = byExternalId.get(normalized.externalId);
      if (externalMatch && externalMatch.id !== matchedPlayer.id) {
        conflicts.push(externalMatch);
      }
    }

    return uniqById(conflicts);
  }

  return {
    resolve(inputLookup: PlayerIdentityLookupInput): PlayerIdentityResolution {
      const normalized = normalizeLookupInput(inputLookup);
      const incomingSourceKey = sourceIdentityKey(normalized);

      if (incomingSourceKey) {
        const primaryMatch = byPrimarySource.get(incomingSourceKey);
        if (primaryMatch) {
          return {
            status: "matched",
            strategy: "source_identity",
            confidence: "high",
            player: primaryMatch,
            normalized,
            conflicts: findConflicts(primaryMatch, normalized),
          };
        }

        const approvedMatch = byApprovedMapping.get(incomingSourceKey);
        if (approvedMatch) {
          return {
            status: "matched",
            strategy: "approved_mapping",
            confidence: "high",
            player: approvedMatch,
            normalized,
            conflicts: findConflicts(approvedMatch, normalized),
          };
        }
      }

      if (normalized.externalId) {
        const externalMatch = byExternalId.get(normalized.externalId);
        if (externalMatch) {
          return {
            status: "matched",
            strategy: "legacy_external_id",
            confidence: "high",
            player: externalMatch,
            normalized,
            conflicts: [],
          };
        }
      }

      const exactTeamKey = namePositionTeamKey(normalized);
      if (exactTeamKey) {
        const candidates = uniqById(byNamePositionTeam.get(exactTeamKey) ?? []);
        if (candidates.length === 1) {
          return {
            status: "matched",
            strategy: "exact_name_position_team",
            confidence: "high",
            player: candidates[0],
            normalized,
            conflicts: [],
          };
        }

        if (candidates.length > 1) {
          return {
            status: "ambiguous",
            strategy: "exact_name_position_team",
            confidence: "low",
            normalized,
            candidates,
            reason: "Multiple canonical players matched the same exact name, position, and NFL team.",
          };
        }
      }

      const exactPositionKey = namePositionKey(normalized);
      if (exactPositionKey) {
        const candidates = uniqById(byNamePosition.get(exactPositionKey) ?? []);
        if (candidates.length === 1) {
          return {
            status: "matched",
            strategy: "exact_name_position",
            confidence: "high",
            player: candidates[0],
            normalized,
            conflicts: [],
          };
        }

        if (candidates.length > 1) {
          return {
            status: "ambiguous",
            strategy: "exact_name_position",
            confidence: "low",
            normalized,
            candidates,
            reason: "Multiple canonical players matched the same exact name and position.",
          };
        }
      }

      return {
        status: "unresolved",
        strategy:
          normalized.externalId
            ? "legacy_external_id"
            : exactTeamKey
              ? "exact_name_position_team"
              : exactPositionKey
                ? "exact_name_position"
                : "none",
        confidence: normalized.searchName && normalized.position ? "low" : "none",
        normalized,
        candidates: [],
        reason: "No canonical player match met the required confidence threshold.",
      };
    },
  };
}
