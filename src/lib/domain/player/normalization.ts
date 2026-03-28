import { Position } from "@prisma/client";

export const PLAYER_POSITION_ORDER: Position[] = ["QB", "RB", "WR", "TE", "K", "DST"];

export function normalizePlayerSourceKey(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePlayerSourceId(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePlayerName(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePlayerDisplayName(value: string | null | undefined, fallback: string) {
  return normalizePlayerName(value) ?? fallback;
}

export function normalizePlayerSearchName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeNflTeam(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePlayerPosition(value: string) {
  const normalized = value.trim().toUpperCase() as Position;
  if (!PLAYER_POSITION_ORDER.includes(normalized)) {
    throw new Error(`Unsupported player position "${value}".`);
  }
  return normalized;
}

export function normalizeNullableInteger(value: number | string | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : Math.max(0, parsed);
}

export function normalizeNullableText(value: string | null | undefined) {
  const normalized = (value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePlayerStatusCode(value: string | null | undefined) {
  const normalized = normalizeNullableText(value);
  return normalized ? normalized.toUpperCase().replace(/[\s-]+/g, "_") : null;
}

export function buildManualPlayerSourceId(input: {
  displayName: string;
  position: Position;
  nflTeam: string | null;
}) {
  const nameSlug = normalizePlayerSearchName(input.displayName)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const teamSlug = normalizeNflTeam(input.nflTeam)?.toLowerCase() ?? "fa";

  return `manual:${nameSlug || "player"}:${input.position.toLowerCase()}:${teamSlug}`;
}
