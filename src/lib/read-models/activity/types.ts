export type ActivityFeedFamily =
  | "lifecycle"
  | "compliance"
  | "commissioner"
  | "trade"
  | "draft"
  | "auction"
  | "sync"
  | "other";

export type ActivityFeedItem = {
  id: string;
  eventType: string;
  eventFamily: ActivityFeedFamily;
  title: string;
  body: string;
  description: string;
  occurredAt: string;
  createdAt: string;
  actorUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  team: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  relatedTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  player: {
    id: string;
    name: string;
    position: string;
    nflTeam: string | null;
  } | null;
  sourceEntityType: string | null;
  sourceEntityId: string | null;
  payload: Record<string, unknown> | null;
  context: Record<string, unknown> | null;
};

export type ActivityFeedProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string | null;
    year: number | null;
  };
  visibility: "league";
  filters: {
    seasonId: string | null;
    teamId: string | null;
    type: string | null;
    category: string | null;
    limit: number;
    cursor: string | null;
  };
  summary: {
    total: number;
    byFamily: Record<string, number>;
    byCategory: Record<string, number>;
    byType: Record<string, number>;
  };
  seasons: {
    id: string;
    year: number;
    status: string;
    phase: string;
  }[];
  teams: {
    id: string;
    name: string;
    abbreviation: string | null;
  }[];
  types: string[];
  page: {
    nextCursor: string | null;
  };
  feed: ActivityFeedItem[];
};
