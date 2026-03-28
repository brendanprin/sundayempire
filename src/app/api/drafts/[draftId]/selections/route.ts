import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";

export async function POST(_request: NextRequest) {
  return apiError(
    410,
    "DRAFT_EXECUTION_ROUTE_RETIRED",
    "The legacy draft selection route is retired. Use rookie draft action routes from Picks & Draft, or the veteran auction room for supported draft execution.",
    {
      retiredRoute: "/api/drafts/[draftId]/selections",
      canonicalRoutes: [
        "/api/drafts/[draftId]/actions/select",
        "/api/drafts/[draftId]/actions/pass",
        "/api/drafts/[draftId]/actions/forfeit",
        "/api/drafts/[draftId]/auction/open-bids",
        "/api/drafts/[draftId]/auction/blind-bids",
      ],
      startupDraftRetired: true,
    },
  );
}
