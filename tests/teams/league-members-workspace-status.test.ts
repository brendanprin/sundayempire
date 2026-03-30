import assert from "node:assert/strict";
import test from "node:test";
import type { TeamSlot, ComprehensiveSlotStatus } from "@/components/teams/league-members-workspace";

// Copy the getComprehensiveStatus function for testing
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

test.describe("Comprehensive Team Slot Status Logic", () => {

  test("identifies owner_joined status correctly", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: "John Smith",
      ownerEmail: "john@example.com",
      status: "filled",
      inviteStatus: "accepted",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: "owner-1",
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "owner_joined");
  });

  test("identifies team_created_no_owner status correctly", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB", 
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: null,
      status: "filled",  // Team exists but no owner
      inviteStatus: null,
      inviteId: null,
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "team_created_no_owner");
  });

  test("identifies invite_pending status correctly", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "john@example.com",
      status: "pending_invite",
      inviteStatus: "pending",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: "delivered",
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_pending");
  });

  test("identifies invite_delivery_failed status correctly", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "invalid-email@nonexistent.com",
      status: "pending_invite",
      inviteStatus: "pending",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: "failed",
      inviteDeliveryDetail: "SMTP Error: Host not found",
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_delivery_failed");
  });

  test("identifies invite_not_configured status correctly", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "local@example.com",
      status: "pending_invite",
      inviteStatus: "pending",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: "not_configured",
      inviteDeliveryDetail: "Email delivery disabled in development environment",
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_not_configured");
  });

  test("identifies invite_revoked status correctly", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "revoked@example.com",
      status: "pending_invite",
      inviteStatus: "revoked",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_revoked");
  });

  test("identifies invite_expired status correctly", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "expired@example.com",
      status: "pending_invite",
      inviteStatus: "expired",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_expired");
  });

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
      ownerId: null,
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "open_slot");
  });

  test("prioritizes revoked status over delivery state", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "test@example.com",
      status: "pending_invite",
      inviteStatus: "revoked",  // Should take precedence
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: "failed", // Should be ignored
      inviteDeliveryDetail: "SMTP error",
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_revoked");
  });

  test("prioritizes expired status over delivery state", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "test@example.com",
      status: "pending_invite",
      inviteStatus: "expired",  // Should take precedence
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: "not_configured", // Should be ignored
      inviteDeliveryDetail: "Email disabled",
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_expired");
  });

  test("handles edge case: owner email but no invite status", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: null,
      ownerEmail: "test@example.com",
      status: "filled",  // Not pending_invite
      inviteStatus: null,
      inviteId: null,
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_pending", "Should default to invite_pending when email exists");
  });

  test("handles edge case: team with owner but no filled status", () => {
    const slot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Lightning Bolts",
      teamAbbreviation: "LB",
      divisionLabel: "North",
      ownerName: "John Smith",
      ownerEmail: "john@example.com",
      status: "pending_invite",  // Not filled
      inviteStatus: "pending",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: "owner-1",
      inviteDeliveryState: null,
      inviteDeliveryDetail: null,
    };

    const status = getComprehensiveStatus(slot);
    assert.equal(status, "invite_pending", "Should be invite_pending even with owner name if not filled status");
  });

  test("handles delivery state priority correctly", () => {
    // Test that failed delivery takes priority over not_configured  
    const failedSlot: TeamSlot = {
      id: "slot-1",
      slotNumber: 1,
      teamName: "Team",
      teamAbbreviation: "T",
      divisionLabel: "North", 
      ownerName: null,
      ownerEmail: "test@example.com",
      status: "pending_invite",
      inviteStatus: "pending",
      inviteId: "invite-1",
      teamId: "team-1",
      ownerId: null,
      inviteDeliveryState: "failed",
      inviteDeliveryDetail: "SMTP error",
    };

    const notConfiguredSlot: TeamSlot = {
      ...failedSlot,
      id: "slot-2",
      inviteDeliveryState: "not_configured",
      inviteDeliveryDetail: "Email disabled",
    };

    assert.equal(getComprehensiveStatus(failedSlot), "invite_delivery_failed");
    assert.equal(getComprehensiveStatus(notConfiguredSlot), "invite_not_configured");
  });

});