import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { toApiResponse } from "@/lib/application/controller";
import { requireLeagueRole } from "@/lib/auth";
import { createLifecycleService } from "@/lib/domain/lifecycle/service";
import { isNewLifecycleEngineEnabled } from "@/lib/feature-flags";
import { getActiveLeagueContext } from "@/lib/league-context";

const lifecycleService = createLifecycleService();

export async function GET(request: NextRequest) {
  if (!isNewLifecycleEngineEnabled()) {
    // This flag only enables the commissioner lifecycle read model.
    return apiError(404, "FEATURE_DISABLED", "The new lifecycle engine is disabled.");
  }

  const context = await getActiveLeagueContext();
  if (!context) {
    return apiError(404, "LEAGUE_CONTEXT_NOT_FOUND", "No active league context was found.");
  }

  const auth = await requireLeagueRole(request, context.leagueId, ["COMMISSIONER"]);
  if (auth.response) {
    return auth.response;
  }

  return toApiResponse(await lifecycleService.readLeagueLifecycle(context.leagueId));
}
