import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";

export async function POST(_request: NextRequest) {
  return apiError(
    410,
    "DRAFT_EXECUTION_ROUTE_RETIRED",
    "The legacy draft undo route is retired. Supported rookie and veteran draft workflows no longer use a generic undo API.",
    {
      retiredRoute: "/api/drafts/[draftId]/undo",
      canonicalRoutes: ["/draft", "/draft/rookie", "/draft/veteran-auction"],
      startupDraftRetired: true,
    },
  );
}
