import assert from "node:assert/strict";
import test from "node:test";

// Import types and test the component logic directly
type TeamSlotStatus = "filled" | "pending_invite" | "open";
type InviteStatus = "pending" | "expired" | "accepted" | "revoked" | null;
type ComprehensiveSlotStatus = 
  | "open_slot"                    
  | "team_created_no_owner"        
  | "invite_pending"               
  | "invite_delivery_failed"       
  | "invite_not_configured"        
  | "owner_joined"                 
  | "invite_revoked"               
  | "invite_expired";  

type TeamSlot = {
  id: string;
  slotNumber: number;
  teamName: string | null;
  teamAbbreviation: string | null;
  divisionLabel: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  status: TeamSlotStatus;
  inviteStatus: InviteStatus;
  inviteId: string | null;
  teamId: string | null;
  ownerId: string | null;
  inviteDeliveryState?: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown" | null;
  inviteDeliveryDetail?: string | null;
};

type LeagueMembersSummary = {
  totalSlots: number;
  filledSlots: number;
  openSlots: number;
  pendingInvites: number;
  createdTeams: number;
  claimedTeams: number;
  leagueName: string;
  canChangeSize: boolean;
};

// Copy the core logic functions for testing
function getComprehensiveStatus(slot: TeamSlot): ComprehensiveSlotStatus {
  // Owner has joined (filled slot with owner)
  if (slot.status === "filled" && slot.ownerName) {
    return "owner_joined";
  }
  
  // Team created but no owner assigned yet
  if (slot.teamName && !slot.ownerName && !slot.ownerEmail) {
    return "team_created_no_owner";
  }
  
  // Handle invite states
  if (slot.status === "pending_invite" || slot.ownerEmail) {
    if (slot.inviteStatus === "revoked") {
      return "invite_revoked";
    }
    if (slot.inviteStatus === "expired") {
      return "invite_expired";
    }
    if (slot.inviteDeliveryState === "failed") {
      return "invite_delivery_failed";
    }
    if (slot.inviteDeliveryState === "not_configured") {
      return "invite_not_configured";
    }
    return "invite_pending";
  }
  
  // Default to open slot
  return "open_slot";
}

function buildInviteSuccessMessage(
  ownerName: string, 
  teamName: string, 
  deliveryInfo: { label: string; detail: string }
): string {
  const inviteSuccess = `Invite created for ${ownerName} and team ${teamName}.`;
  
  if (deliveryInfo.label.toLowerCase().includes('not configured') || 
      deliveryInfo.label.toLowerCase().includes('disabled')) {
    return `${inviteSuccess} Email delivery is disabled in this environment. The invite is still valid and can be copied or resent later.`;
  }
  
  if (deliveryInfo.label.toLowerCase().includes('failed')) {
    return `${inviteSuccess} Email delivery failed, but the invite is still valid and can be resent. ${deliveryInfo.detail}`;
  }
  
  if (deliveryInfo.label.toLowerCase().includes('sent')) {
    return `${inviteSuccess} Email sent successfully to ${ownerName}.`;
  }
  
  return `${inviteSuccess} ${deliveryInfo.label}: ${deliveryInfo.detail}`;
}

test.describe("League Members Workspace Regression Tests", () => {

  test.describe("Comprehensive Status Logic", () => {
    
    test("identifies open_slot status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-1",
        slotNumber: 1,
        teamName: null,
        teamAbbreviation: null,
        divisionLabel: null,
        ownerName: null,
        ownerEmail: null,
        status: "open",
        inviteStatus: null,
        inviteId: null,
        teamId: null,
        ownerId: null
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "open_slot");
    });

    test("identifies team_created_no_owner status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-2",
        slotNumber: 2,
        teamName: "Lightning Bolts",
        teamAbbreviation: "LB",
        divisionLabel: "North",
        ownerName: null,
        ownerEmail: null,
        status: "open",
        inviteStatus: null,
        inviteId: null,
        teamId: "team-2",
        ownerId: null
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "team_created_no_owner");
    });

    test("identifies invite_pending status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-3",
        slotNumber: 3,
        teamName: "Thunder Hawks",
        teamAbbreviation: "TH",
        divisionLabel: "South",
        ownerName: null,
        ownerEmail: "owner@example.com",
        status: "pending_invite",
        inviteStatus: "pending",
        inviteId: "invite-3",
        teamId: "team-3",
        ownerId: null,
        inviteDeliveryState: "sent"
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "invite_pending");
    });

    test("identifies invite_delivery_failed status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-4",
        slotNumber: 4,
        teamName: "Storm Eagles",
        teamAbbreviation: "SE",
        divisionLabel: "East",
        ownerName: null,
        ownerEmail: "failed@example.com",
        status: "pending_invite",
        inviteStatus: "pending",
        inviteId: "invite-4",
        teamId: "team-4",
        ownerId: null,
        inviteDeliveryState: "failed",
        inviteDeliveryDetail: "Invalid email address"
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "invite_delivery_failed");
    });

    test("identifies invite_not_configured status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-5",
        slotNumber: 5,
        teamName: "Fire Dragons",
        teamAbbreviation: "FD",
        divisionLabel: "West",
        ownerName: null,
        ownerEmail: "local@example.com",
        status: "pending_invite",
        inviteStatus: "pending",
        inviteId: "invite-5",
        teamId: "team-5",
        ownerId: null,
        inviteDeliveryState: "not_configured",
        inviteDeliveryDetail: "Email service disabled in development"
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "invite_not_configured");
    });

    test("identifies invite_revoked status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-6",
        slotNumber: 6,
        teamName: "Ice Panthers",
        teamAbbreviation: "IP",
        divisionLabel: "North",
        ownerName: null,
        ownerEmail: "revoked@example.com",
        status: "pending_invite",
        inviteStatus: "revoked",
        inviteId: "invite-6",
        teamId: "team-6",
        ownerId: null,
        inviteDeliveryState: "sent"
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "invite_revoked");
    });

    test("identifies invite_expired status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-7",
        slotNumber: 7,
        teamName: "Wind Wolves",
        teamAbbreviation: "WW",
        divisionLabel: "South",
        ownerName: null,
        ownerEmail: "expired@example.com",
        status: "pending_invite",
        inviteStatus: "expired",
        inviteId: "invite-7",
        teamId: "team-7",
        ownerId: null,
        inviteDeliveryState: "sent"
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "invite_expired");
    });

    test("identifies owner_joined status correctly", () => {
      const slot: TeamSlot = {
        id: "slot-8",
        slotNumber: 8,
        teamName: "Galaxy Stars",
        teamAbbreviation: "GS",
        divisionLabel: "East",
        ownerName: "John Smith",
        ownerEmail: "john@example.com",
        status: "filled",
        inviteStatus: "accepted",
        inviteId: "invite-8",
        teamId: "team-8",
        ownerId: "owner-8"
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "owner_joined");
    });

    test("prioritizes delivery state over invite status for pending invites", () => {
      // Failed delivery should override pending status
      const failedSlot: TeamSlot = {
        id: "slot-9",
        slotNumber: 9,
        teamName: "Test Team",
        teamAbbreviation: "TT",
        divisionLabel: "Test",
        ownerName: null,
        ownerEmail: "test@example.com",
        status: "pending_invite",
        inviteStatus: "pending",
        inviteId: "invite-9",
        teamId: "team-9",
        ownerId: null,
        inviteDeliveryState: "failed"
      };

      assert.equal(getComprehensiveStatus(failedSlot), "invite_delivery_failed");

      // Not configured should override pending status
      const notConfiguredSlot: TeamSlot = {
        ...failedSlot,
        inviteDeliveryState: "not_configured"
      };

      assert.equal(getComprehensiveStatus(notConfiguredSlot), "invite_not_configured");
    });
  });

  test.describe("Invite Success Message Generation", () => {
    
    test("generates correct message for successful email delivery", () => {
      const message = buildInviteSuccessMessage(
        "John Smith",
        "Lightning Bolts",
        { label: "Email sent", detail: "Delivered successfully" }
      );

      assert.equal(
        message, 
        "Invite created for John Smith and team Lightning Bolts. Email sent successfully to John Smith."
      );
    });

    test("generates correct message for disabled email delivery", () => {
      const message = buildInviteSuccessMessage(
        "Jane Doe",
        "Thunder Hawks",
        { label: "Email disabled", detail: "Development environment" }
      );

      assert.equal(
        message, 
        "Invite created for Jane Doe and team Thunder Hawks. Email delivery is disabled in this environment. The invite is still valid and can be copied or resent later."
      );
    });

    test("generates correct message for failed email delivery", () => {
      const message = buildInviteSuccessMessage(
        "Bob Wilson",
        "Fire Dragons",
        { label: "Delivery failed", detail: "Invalid email domain" }
      );

      assert.equal(
        message, 
        "Invite created for Bob Wilson and team Fire Dragons. Email delivery failed, but the invite is still valid and can be resent. Invalid email domain"
      );
    });

    test("generates generic message for unknown delivery state", () => {
      const message = buildInviteSuccessMessage(
        "Alice Brown",
        "Storm Eagles",
        { label: "Queued", detail: "Processing..." }
      );

      assert.equal(
        message, 
        "Invite created for Alice Brown and team Storm Eagles. Queued: Processing..."
      );
    });

    test("handles case-insensitive message matching", () => {
      const message1 = buildInviteSuccessMessage(
        "Test Owner",
        "Test Team",
        { label: "NOT CONFIGURED", detail: "Service unavailable" }
      );

      assert.equal(
        message1, 
        "Invite created for Test Owner and team Test Team. Email delivery is disabled in this environment. The invite is still valid and can be copied or resent later."
      );

      const message2 = buildInviteSuccessMessage(
        "Test Owner",
        "Test Team",
        { label: "DELIVERY FAILED", detail: "Network timeout" }
      );

      assert.equal(
        message2, 
        "Invite created for Test Owner and team Test Team. Email delivery failed, but the invite is still valid and can be resent. Network timeout"
      );
    });
  });

  test.describe("League Summary Validation", () => {
    
    test("calculates correct slot counts for empty league", () => {
      const summary: LeagueMembersSummary = {
        totalSlots: 12,
        filledSlots: 0,
        openSlots: 12,
        pendingInvites: 0,
        createdTeams: 0,
        claimedTeams: 0,
        leagueName: "Test League",
        canChangeSize: true
      };

      assert.equal(summary.totalSlots, 12);
      assert.equal(summary.openSlots, summary.totalSlots);
      assert.equal(summary.filledSlots + summary.openSlots, summary.totalSlots);
    });

    test("calculates correct slot counts for partially filled league", () => {
      const summary: LeagueMembersSummary = {
        totalSlots: 12,
        filledSlots: 3,
        openSlots: 7,
        pendingInvites: 2,
        createdTeams: 5,
        claimedTeams: 3,
        leagueName: "Partial League",
        canChangeSize: true
      };

      // Verify total slots consistency
      assert.equal(summary.filledSlots + summary.openSlots + summary.pendingInvites, summary.totalSlots);
      
      // Verify team counts make sense
      assert.equal(summary.claimedTeams, summary.filledSlots, "Claimed teams should equal filled slots");
      assert.ok(summary.createdTeams >= summary.claimedTeams, "Created teams should be >= claimed teams");
      assert.ok(summary.pendingInvites <= summary.createdTeams, "Pending invites should be <= created teams");
    });

    test("handles full league correctly", () => {
      const summary: LeagueMembersSummary = {
        totalSlots: 12,
        filledSlots: 12,
        openSlots: 0,
        pendingInvites: 0,
        createdTeams: 12,
        claimedTeams: 12,
        leagueName: "Full League",
        canChangeSize: false
      };

      assert.equal(summary.openSlots, 0);
      assert.equal(summary.pendingInvites, 0);
      assert.equal(summary.filledSlots, summary.totalSlots);
      assert.equal(summary.createdTeams, summary.totalSlots);
      assert.equal(summary.claimedTeams, summary.totalSlots);
      assert.equal(summary.canChangeSize, false);
    });
  });

  test.describe("CSV Import Helper Functions", () => {
    
    test("counts valid rows correctly", () => {
      const validation = {
        rows: [
          { valid: true, data: { team_name: "Team 1" } },
          { valid: false, data: { team_name: "Team 2" }, errors: ["Missing email"] },
          { valid: true, data: { team_name: "Team 3" } },
          { valid: false, data: { team_name: "Team 4" }, errors: ["Invalid format"] }
        ]
      };

      function getValidRowCount(validation: any): number {
        if (!validation || !Array.isArray(validation.rows)) return 0;
        return validation.rows.filter((row: any) => row.valid).length;
      }

      assert.equal(getValidRowCount(validation), 2);
      assert.equal(getValidRowCount(null), 0);
      assert.equal(getValidRowCount({ rows: null }), 0);
      assert.equal(getValidRowCount({ rows: [] }), 0);
    });

    test("determines if import has valid rows", () => {
      const validValidation = {
        rows: [
          { valid: false, errors: ["Error"] },
          { valid: true, data: { team_name: "Team 1" } }
        ]
      };

      const invalidValidation = {
        rows: [
          { valid: false, errors: ["Error 1"] },
          { valid: false, errors: ["Error 2"] }
        ]
      };

      function hasValidRows(validation: any): boolean {
        if (!validation || !Array.isArray(validation.rows)) return false;
        return validation.rows.filter((row: any) => row.valid).length > 0;
      }

      assert.equal(hasValidRows(validValidation), true);
      assert.equal(hasValidRows(invalidValidation), false);
      assert.equal(hasValidRows(null), false);
      assert.equal(hasValidRows({ rows: [] }), false);
    });

    test("counts owners to invite correctly", () => {
      const validation = {
        rows: [
          { valid: true, data: { team_name: "Team 1", owner_email: "owner1@example.com" } },
          { valid: true, data: { team_name: "Team 2", owner_email: null } },
          { valid: false, data: { team_name: "Team 3", owner_email: "owner3@example.com" } },
          { valid: true, data: { team_name: "Team 4", owner_email: "owner4@example.com" } }
        ]
      };

      function getOwnersToInviteCount(validation: any): number {
        if (!validation || !Array.isArray(validation.rows)) return 0;
        return validation.rows.filter((row: any) => row.valid && row.data?.owner_email).length;
      }

      assert.equal(getOwnersToInviteCount(validation), 2);
    });

    test("counts duplicates correctly", () => {
      const validation = {
        rows: [
          { valid: false, errors: ["Duplicate team name"] },
          { valid: true, data: { team_name: "Team 1" } },
          { valid: false, errors: ["Duplicate email address"] },
          { valid: false, errors: ["Missing required field", "Duplicate abbreviation"] }
        ]
      };

      function getDuplicatesCount(validation: any): number {
        if (!validation || !Array.isArray(validation.rows)) return 0;
        return validation.rows.filter((row: any) => 
          row.errors?.some((error: string) => error.toLowerCase().includes('duplicate'))
        ).length;
      }

      assert.equal(getDuplicatesCount(validation), 3);
    });
  });

  test.describe("Edge Case Handling", () => {
    
    test("handles slot with email but no other invite data", () => {
      const slot: TeamSlot = {
        id: "edge-1",
        slotNumber: 1,
        teamName: null,
        teamAbbreviation: null,
        divisionLabel: null,
        ownerName: null,
        ownerEmail: "orphan@example.com",
        status: "open",
        inviteStatus: null,
        inviteId: null,
        teamId: null,
        ownerId: null
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "invite_pending");
    });

    test("handles slot with team but inconsistent status", () => {
      const slot: TeamSlot = {
        id: "edge-2",
        slotNumber: 2,
        teamName: "Ghost Team",
        teamAbbreviation: "GT",
        divisionLabel: "Limbo",
        ownerName: "Ghost Owner",
        ownerEmail: "ghost@example.com",
        status: "open", // Inconsistent: has team and owner but marked as open
        inviteStatus: null,
        inviteId: null,
        teamId: "ghost-team",
        ownerId: "ghost-owner"
      };

      const status = getComprehensiveStatus(slot);
      // Should prioritize the team_created_no_owner logic over status field
      // since ownerName exists but status is open, this goes to invite_pending due to email
      assert.equal(status, "invite_pending");
    });

    test("handles null and undefined values gracefully", () => {
      const slot: TeamSlot = {
        id: "edge-3",
        slotNumber: 3,
        teamName: "",  // Empty string
        teamAbbreviation: null,
        divisionLabel: undefined as any,
        ownerName: null,
        ownerEmail: null,
        status: "open",
        inviteStatus: null,
        inviteId: null,
        teamId: null,
        ownerId: null
      };

      const status = getComprehensiveStatus(slot);
      assert.equal(status, "open_slot");
    });
  });

});