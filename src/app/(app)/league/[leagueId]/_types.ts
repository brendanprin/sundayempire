import type { CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";

export type FounderSetupStatus = "COMPLETE" | "INCOMPLETE_REQUIRED" | "INCOMPLETE_POSTPONED";
export type FounderSetupAction = "create" | "claim" | "skip";

export type FounderSetupPayload = {
  leagueId: string;
  isComplete: boolean;
  status: FounderSetupStatus;
  hasPostponed: boolean;
  currentTeam: {
    id: string;
    name: string;
    abbreviation: string | null;
  } | null;
  claimableTeams: {
    id: string;
    name: string;
    abbreviation: string | null;
    ownerName: string | null;
  }[];
};

export type LeagueInvitesPayload = {
  invites: CommissionerInviteRow[];
  capabilities: {
    copyFreshLink: boolean;
  };
};

export type SetupBulkImportValidationRow = {
  rowNumber: number;
  status: "valid" | "invalid";
  errors: string[];
  row: {
    ownerName: string;
    ownerEmail: string;
    teamName: string;
    teamAbbreviation: string | null;
    divisionLabel: string | null;
  };
};

export type SetupBulkImportApplyResult = {
  rowNumber: number;
  status: "created" | "failed";
  message: string;
  teamId: string | null;
  inviteId: string | null;
};

export type SetupBulkImportPayload = {
  mode: "validate" | "apply";
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    createdRows?: number;
    failedRows?: number;
  };
  rows: SetupBulkImportValidationRow[];
  applyResults?: SetupBulkImportApplyResult[];
};

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
