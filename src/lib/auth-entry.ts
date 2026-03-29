import {
  isInviteReturnTo,
  normalizeReturnTo,
  parseLeagueIdFromReturnTo,
} from "@/lib/return-to";

export type AuthenticatedLeagueEntry =
  | {
      kind: "none";
      leagueIds: string[];
      singleLeagueId: null;
    }
  | {
      kind: "single";
      leagueIds: string[];
      singleLeagueId: string;
    }
  | {
      kind: "multiple";
      leagueIds: string[];
      singleLeagueId: null;
    };

export function resolveAuthenticatedLeagueEntry(
  leagueIds: Array<string | null | undefined>,
): AuthenticatedLeagueEntry {
  const normalizedLeagueIds = Array.from(
    new Set(
      leagueIds
        .map((leagueId) => leagueId?.trim() ?? "")
        .filter((leagueId): leagueId is string => leagueId.length > 0),
    ),
  );

  if (normalizedLeagueIds.length === 0) {
    return {
      kind: "none",
      leagueIds: [],
      singleLeagueId: null,
    };
  }

  if (normalizedLeagueIds.length === 1) {
    return {
      kind: "single",
      leagueIds: [normalizedLeagueIds[0]],
      singleLeagueId: normalizedLeagueIds[0],
    };
  }

  return {
    kind: "multiple",
    leagueIds: normalizedLeagueIds,
    singleLeagueId: null,
  };
}

export function resolvePostAuthenticationDestination(input: {
  returnTo: string | null | undefined;
  readyLeagueIds: Array<string | null | undefined>;
  explicitLeagueId?: string | null | undefined;
}) {
  const normalizedReturnTo = normalizeReturnTo(input.returnTo);
  const entry = resolveAuthenticatedLeagueEntry(input.readyLeagueIds);
  const explicitLeagueId = input.explicitLeagueId?.trim() ?? "";
  const validExplicitLeagueId =
    explicitLeagueId.length > 0 && entry.leagueIds.includes(explicitLeagueId)
      ? explicitLeagueId
      : null;

  if (!normalizedReturnTo || normalizedReturnTo === "/") {
    if (entry.kind === "single") {
      return {
        redirectTo: `/league/${entry.singleLeagueId}`,
        activeLeagueId: entry.singleLeagueId,
      };
    }

    return {
      redirectTo: "/dashboard",
      activeLeagueId: validExplicitLeagueId,
    };
  }

  if (isInviteReturnTo(normalizedReturnTo)) {
    return {
      redirectTo: normalizedReturnTo,
      activeLeagueId: validExplicitLeagueId,
    };
  }

  const returnToLeagueId = parseLeagueIdFromReturnTo(normalizedReturnTo);
  if (returnToLeagueId) {
    return {
      redirectTo: entry.leagueIds.includes(returnToLeagueId) ? normalizedReturnTo : "/dashboard",
      activeLeagueId: entry.leagueIds.includes(returnToLeagueId) ? returnToLeagueId : null,
    };
  }

  if (entry.kind === "single") {
    return {
      redirectTo: normalizedReturnTo,
      activeLeagueId: entry.singleLeagueId,
    };
  }

  if (validExplicitLeagueId) {
    return {
      redirectTo: normalizedReturnTo,
      activeLeagueId: validExplicitLeagueId,
    };
  }

  return {
    redirectTo: "/dashboard",
    activeLeagueId: null,
  };
}
