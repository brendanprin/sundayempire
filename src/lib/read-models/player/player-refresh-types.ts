export type PlayerRefreshCountsSummary = {
  new: number;
  updated: number;
  unchanged: number;
  invalid: number;
  ambiguous: number;
  duplicateSuspect: number;
  totalSubmitted: number;
  totalNormalized: number;
  totalProcessed: number;
  warnings: string[];
  errors: string[];
};

export type PlayerRefreshJobSummary = {
  id: string;
  status: string;
  adapterKey: string;
  adapterLabel: string;
  sourceLabel: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  payloadDigest: string | null;
  requestedByUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  changeCount: number;
  pendingReviewCount: number;
  appliedReviewCount: number;
  rejectedReviewCount: number;
  summary: PlayerRefreshCountsSummary | null;
};

export type PlayerRefreshChangeCandidate = {
  id: string;
  name: string;
  displayName: string;
  position: string;
  nflTeam: string | null;
  externalId: string | null;
  sourceKey: string | null;
  sourcePlayerId: string | null;
  isRestricted: boolean;
};

export type PlayerRefreshChangeDetail = {
  id: string;
  changeType: string;
  reviewStatus: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
  fieldMask: string[];
  sourceIdentity: {
    sourceKey: string | null;
    sourcePlayerId: string | null;
    externalId: string | null;
  } | null;
  player: {
    id: string;
    name: string;
    displayName: string;
    position: string;
    nflTeam: string | null;
  } | null;
  reviewedByUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  previousValues: Record<string, unknown> | null;
  incomingValues: Record<string, unknown> | null;
  appliedValues: Record<string, unknown> | null;
  candidatePlayers: PlayerRefreshChangeCandidate[];
  permissions: {
    canResolve: boolean;
    canReject: boolean;
  };
};

export type PlayerRefreshJobDetailProjection = {
  job: PlayerRefreshJobSummary;
  summary: PlayerRefreshCountsSummary & {
    pendingReviewCount: number;
    appliedReviewCount: number;
    rejectedReviewCount: number;
  };
  groups: {
    id: "pending" | "applied" | "rejected";
    label: string;
    description: string;
    changes: PlayerRefreshChangeDetail[];
  }[];
};

export type PlayerRefreshJobsProjection = {
  adapters: {
    key: string;
    label: string;
  }[];
  jobs: PlayerRefreshJobSummary[];
};
