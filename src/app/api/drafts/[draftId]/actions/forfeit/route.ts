import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { requireDraftLeagueRole } from "@/lib/authorization";
import { createRookieSelectionService } from "@/lib/domain/draft/rookie-selection-service";
import { RookieDraftActionResponse } from "@/types/draft";

type RouteContext = {
  params: Promise<{
    draftId: string;
  }>;
};

export async function POST(request: NextRequest, routeContext: RouteContext) {
  const { draftId } = await routeContext.params;
  const access = await requireDraftLeagueRole(request, draftId, ["COMMISSIONER"]);
  if (access.response) {
    return access.response;
  }
  const context = access.context;
  const actor = access.actor;

  const service = createRookieSelectionService();

  try {
    const result = await service.forfeit({
      leagueId: context.leagueId,
      seasonId: context.seasonId,
      draftId,
      actor: {
        userId: actor.userId,
        leagueRole: actor.leagueRole,
        teamId: actor.teamId,
      },
    });

    const response: RookieDraftActionResponse = {
      draft: result.draft,
    };

    return NextResponse.json(response);
  } catch (error) {
    if (service.isActionError(error)) {
      return apiError(error.status, error.code, error.message, error.context);
    }

    return apiError(409, "DRAFT_ACTION_FAILED", "Rookie draft forfeit action could not be completed.");
  }
}
