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


export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
