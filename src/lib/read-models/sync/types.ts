export type SyncJobSummary = {
  id: string;
  jobType: string;
  status: string;
  trigger: string;
  adapterKey: string;
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
  mismatchCount: number;
  summary: {
    created: number;
    updated: number;
    resolved: number;
    totalOpen: number;
    totalDetected: number;
    warnings: string[];
    errors: string[];
    domains: {
      rosterImported: number;
      transactionsImported: number;
    };
  } | null;
};

export type SyncMismatchSummary = {
  id: string;
  mismatchType: string;
  severity: string;
  status: string;
  title: string;
  message: string;
  team: {
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
  hostPlatformReferenceId: string | null;
  lastDetectedAt: string;
  detectionCount: number;
  complianceIssueId: string | null;
  job: {
    id: string;
    jobType: string;
    status: string;
    createdAt: string;
  };
};

export type SyncIssuesQueueProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  filters: {
    status: string | null;
    severity: string | null;
    teamId: string | null;
  };
  summary: {
    openCount: number;
    escalatedCount: number;
    highImpactCount: number;
  };
  teams: {
    id: string;
    name: string;
    abbreviation: string | null;
  }[];
  recentJobs: SyncJobSummary[];
  issues: SyncMismatchSummary[];
  adapters: {
    key: string;
    label: string;
  }[];
};

export type SyncIssueDetailProjection = {
  league: {
    id: string;
    name: string;
  };
  season: {
    id: string;
    year: number;
  };
  mismatch: {
    id: string;
    mismatchType: string;
    severity: string;
    status: string;
    resolutionType: string | null;
    title: string;
    message: string;
    fingerprint: string;
    hostPlatformReferenceId: string | null;
    detectionCount: number;
    firstDetectedAt: string;
    lastDetectedAt: string;
    resolvedAt: string | null;
    resolutionReason: string | null;
    team: {
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
    rosterAssignment: {
      id: string;
      teamId: string;
      seasonId: string;
      playerId: string;
      rosterStatus: string;
      hostPlatformReferenceId: string | null;
    } | null;
    complianceIssue: {
      id: string;
      source: string;
      issueType: string;
      severity: string;
      status: string;
      code: string;
      title: string;
    } | null;
    resolvedByUser: {
      id: string;
      email: string;
      name: string | null;
    } | null;
    hostValue: Record<string, unknown> | null;
    dynastyValue: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
  };
  job: SyncJobSummary | null;
  permissions: {
    canResolve: boolean;
    canEscalate: boolean;
  };
};
