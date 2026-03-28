import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { getAuthActorForLeague, getAuthenticatedUser, isDemoAuthLoginEnabled } from "@/lib/auth";
import { resolveActiveLeagueContext } from "@/lib/league-context";

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return apiError(401, "AUTH_REQUIRED", "Authentication is required.");
  }

  const leagueResolution = await resolveActiveLeagueContext();
  const activeLeague = leagueResolution.activeContext
    ? {
        id: leagueResolution.activeContext.leagueId,
        name: leagueResolution.activeContext.leagueName,
        seasonId: leagueResolution.activeContext.seasonId,
        seasonYear: leagueResolution.activeContext.seasonYear,
      }
    : null;

  const actor = activeLeague
    ? await getAuthActorForLeague(request, activeLeague.id)
    : null;

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      accountRole: user.platformRole,
    },
    actor: actor
      ? {
          userId: actor.userId,
          email: actor.email,
          name: actor.name,
          accountRole: actor.accountRole,
          leagueRole: actor.leagueRole,
          teamId: actor.teamId,
          teamName: actor.teamName,
          leagueId: actor.leagueId,
        }
      : null,
    activeLeague,
    demoAuthEnabled: isDemoAuthLoginEnabled(),
  });
}
