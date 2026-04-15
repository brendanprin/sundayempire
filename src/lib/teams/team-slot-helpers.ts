import type { CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";
import type { TeamSlot, LeagueMembersSummary } from "@/components/teams/league-members-workspace";
import type { LeagueLandingDashboardProjection } from "@/lib/read-models/dashboard/types";
import type { TeamListItem } from "@/types/teams";

// Helper to derive team slot data from dashboard and invite data.
// Pass `teams` from /api/teams to get real names/owners; omit for a count-only placeholder view.
export function buildTeamSlotsFromDashboard(
  dashboard: LeagueLandingDashboardProjection,
  invites: CommissionerInviteRow[],
  teams?: TeamListItem[],
): TeamSlot[] {
  const teamSlots: TeamSlot[] = [];

  // When real team data is available, build slots from it
  if (teams && teams.length > 0) {
    teams.forEach((team, index) => {
      teamSlots.push({
        id: team.id,
        slotNumber: index + 1,
        teamName: team.name,
        teamAbbreviation: team.abbreviation,
        divisionLabel: team.divisionLabel,
        ownerName: team.owner?.name ?? null,
        ownerEmail: null,
        status: "filled",
        inviteStatus: null,
        inviteId: null,
        teamId: team.id,
        ownerId: team.owner?.id ?? null,
        inviteDeliveryState: null,
        inviteDeliveryDetail: null,
      });
    });
  } else {
    // Fallback: generate placeholder slots from summary team count
    const existingTeamCount = dashboard.leagueDashboard.summary.teamCount || 0;
    for (let i = 1; i <= existingTeamCount; i++) {
      teamSlots.push({
        id: `slot-${i}`,
        slotNumber: i,
        teamName: `Team ${i}`,
        teamAbbreviation: null,
        divisionLabel: null,
        ownerName: null,
        ownerEmail: null,
        status: "filled",
        inviteStatus: null,
        inviteId: null,
        teamId: `team-${i}`,
        ownerId: null,
        inviteDeliveryState: null,
        inviteDeliveryDetail: null,
      });
    }
  }

  const filledTeamCount = teamSlots.length;

  // Append invite-backed slots (pending, expired, revoked — not accepted)
  const allInvites = invites.filter(invite => invite.status !== "accepted");
  allInvites.forEach((invite, index) => {
    const slotNumber = filledTeamCount + index + 1;
    teamSlots.push({
      id: `slot-${slotNumber}`,
      slotNumber,
      teamName: invite.team?.name ?? null,
      teamAbbreviation: null,
      divisionLabel: null,
      ownerName: invite.owner?.name ?? null,
      ownerEmail: invite.email,
      status: "pending_invite",
      inviteStatus: invite.status as TeamSlot["inviteStatus"],
      inviteId: invite.id,
      teamId: invite.team?.id ?? null,
      ownerId: invite.owner?.id ?? null,
      inviteDeliveryState: invite.delivery?.state ?? null,
      inviteDeliveryDetail: invite.delivery?.detail ?? null,
    });
  });

  // Fill remaining slots up to the target size as open
  const targetSlots = Math.max(12, teamSlots.length + 1);
  for (let i = teamSlots.length + 1; i <= targetSlots; i++) {
    teamSlots.push({
      id: `slot-${i}`,
      slotNumber: i,
      teamName: null,
      teamAbbreviation: null,
      divisionLabel: null,
      ownerName: null,
      ownerEmail: null,
      status: "open",
      inviteStatus: null,
      inviteId: null,
      teamId: null,
      ownerId: null,
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    });
  }

  return teamSlots.sort((a, b) => a.slotNumber - b.slotNumber);
}

export function buildLeagueMembersSummary(
  dashboard: LeagueLandingDashboardProjection,
  teamSlots: TeamSlot[]
): LeagueMembersSummary {
  const totalSlots = teamSlots.length;
  const filledSlots = teamSlots.filter(slot => slot.status === "filled").length;
  const pendingInvites = teamSlots.filter(slot => slot.status === "pending_invite").length;
  const openSlots = teamSlots.filter(slot => slot.status === "open").length;
  const createdTeams = teamSlots.filter(slot =>
    slot.status === "filled" || (slot.status === "pending_invite" && slot.teamName)
  ).length;
  const claimedTeams = filledSlots;
  const canChangeSize = createdTeams === 0 || totalSlots >= createdTeams;

  return {
    totalSlots,
    filledSlots,
    pendingInvites,
    openSlots,
    createdTeams,
    claimedTeams,
    canChangeSize,
    leagueName: dashboard.leagueDashboard.league.name,
  };
}
