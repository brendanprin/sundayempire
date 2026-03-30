import type { CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";
import type { TeamSlot, LeagueMembersSummary } from "@/components/teams/league-members-workspace";
import type { LeagueLandingDashboardProjection } from "@/lib/read-models/dashboard/types";

// Helper to derive team slot data from dashboard and invite data
export function buildTeamSlotsFromDashboard(
  dashboard: LeagueLandingDashboardProjection,
  invites: CommissionerInviteRow[]
): TeamSlot[] {
  const teamSlots: TeamSlot[] = [];
  
  // Extract team count from dashboard summary
  const existingTeamCount = dashboard.leagueDashboard.summary.teamCount || 0;
  
  // Calculate target slot count (default to 12, but could be dynamic)
  const targetSlots = Math.max(12, existingTeamCount + invites.filter(i => i.status === "pending").length);
  
  // Create slots for existing teams (simplified since we don't have detailed team data in dashboard)
  for (let i = 1; i <= existingTeamCount; i++) {
    const teamSlot: TeamSlot = {
      id: `slot-${i}`,
      slotNumber: i,
      teamName: `Team ${i}`, // Placeholder - would need separate API call for details
      teamAbbreviation: null,
      divisionLabel: null,
      ownerName: null,
      ownerEmail: null,
      status: "filled",
      inviteStatus: null,
      inviteId: null,
      teamId: `team-${i}`, // Placeholder
      ownerId: null,
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };
    teamSlots.push(teamSlot);
  }
  
  // Create slots for all invites (pending, expired, revoked)
  const allInvites = invites.filter(invite => invite.status !== "accepted");
  allInvites.forEach((invite, index) => {
    const slotNumber = existingTeamCount + index + 1;
    const teamSlot: TeamSlot = {
      id: `slot-${slotNumber}`,
      slotNumber,
      teamName: invite.team?.name || null,
      teamAbbreviation: null, // Not available in invite data
      divisionLabel: null, // Not available in invite data
      ownerName: invite.owner?.name || null,
      ownerEmail: invite.email,
      status: "pending_invite",
      inviteStatus: invite.status as any,
      inviteId: invite.id,
      teamId: invite.team?.id || null,
      ownerId: invite.owner?.id || null,
      // Add delivery information
      inviteDeliveryState: invite.delivery?.state || null,
      inviteDeliveryDetail: invite.delivery?.detail || null,
    };
    teamSlots.push(teamSlot);
  });
  
  // Fill remaining slots as open
  const filledSlots = teamSlots.length;
  for (let i = filledSlots + 1; i <= targetSlots; i++) {
    const teamSlot: TeamSlot = {
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
    };
    teamSlots.push(teamSlot);
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
  
  // Calculate created teams (either filled or pending invite with team name)
  const createdTeams = teamSlots.filter(slot => 
    slot.status === "filled" || (slot.status === "pending_invite" && slot.teamName)
  ).length;
  
  // Calculate claimed teams (only filled slots with actual owners)
  const claimedTeams = filledSlots;
  
  // League size can be changed if there are no teams created yet or if reducing won't delete existing teams
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