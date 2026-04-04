import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { toApiResponse } from "@/lib/application/controller";
import { requireCurrentLeagueRole } from "@/lib/authorization";
import { createLifecycleService } from "@/lib/domain/lifecycle/service";
import { isNewLifecycleEngineEnabled } from "@/lib/feature-flags";

const lifecycleService = createLifecycleService();

export async function GET(request: NextRequest) {
  if (!isNewLifecycleEngineEnabled()) {
    // This flag only enables the commissioner lifecycle read model.
    return apiError(404, "FEATURE_DISABLED", "The new lifecycle engine is disabled.");
  }

  const access = await requireCurrentLeagueRole(request, ["COMMISSIONER"]);
  if (access.response) return access.response;
  const { context } = access;

  return toApiResponse(await lifecycleService.readLeagueLifecycle(context.leagueId));
}
