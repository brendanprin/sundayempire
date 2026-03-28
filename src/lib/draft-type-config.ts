import type { DraftType } from "@prisma/client";

export type DraftRouteSegment = "rookie" | "veteran-auction";

const ROUTE_SEGMENT_BY_DRAFT_TYPE: Partial<Record<DraftType, DraftRouteSegment>> = {
  ROOKIE: "rookie",
  VETERAN_AUCTION: "veteran-auction",
};

export function routeSegmentForDraftType(draftType: DraftType): DraftRouteSegment | null {
  return ROUTE_SEGMENT_BY_DRAFT_TYPE[draftType] ?? null;
}
