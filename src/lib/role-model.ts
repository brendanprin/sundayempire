import { LeagueRole, PlatformRole } from "@prisma/client";

export type AccountRole = "ADMIN" | "USER";
export type CanonicalLeagueRole = "COMMISSIONER" | "MEMBER";
export type LeagueRoleInput = LeagueRole | CanonicalLeagueRole;
export type AcceptedLeagueRole = CanonicalLeagueRole;

export function toCanonicalLeagueRole(role: LeagueRoleInput): CanonicalLeagueRole {
  return role === "COMMISSIONER" ? "COMMISSIONER" : "MEMBER";
}

export function hasAcceptedLeagueRole(input: {
  leagueRole: CanonicalLeagueRole;
  acceptedRoles: readonly AcceptedLeagueRole[];
}) {
  return input.acceptedRoles.some((acceptedRole) => acceptedRole === input.leagueRole);
}

export function isRecognizedPlatformRole(value: unknown): value is PlatformRole {
  return value === "ADMIN" || value === "USER";
}
