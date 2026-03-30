import assert from "node:assert/strict";
import test from "node:test";
import { buildTeamSlotsFromDashboard, buildLeagueMembersSummary } from "@/lib/teams/team-slot-helpers";
import type { LeagueLandingDashboardProjection } from "@/lib/read-models/dashboard/types";
import type { CommissionerInviteRow } from "@/components/commissioner/invite-management-panel";

test.describe("League Members Workspace Business Logic", () => {

  test("builds team slots for empty league with no teams or invites", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 0 }
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    assert.equal(slots.length, 12, "Should create 12 default slots");
    assert.equal(slots.filter(s => s.status === "open").length, 12, "All slots should be open");
    assert.equal(slots[0].slotNumber, 1, "First slot should be numbered 1");
    assert.equal(slots[11].slotNumber, 12, "Last slot should be numbered 12");
  });

  test("builds team slots with existing teams from dashboard", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 3 }
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    assert.equal(slots.length, 12, "Should create 12 total slots");
    assert.equal(slots.filter(s => s.status === "filled").length, 3, "Should have 3 filled slots");
    assert.equal(slots.filter(s => s.status === "open").length, 9, "Should have 9 open slots");
    
    // Verify filled slots have placeholder data
    const firstTeam = slots[0];
    assert.equal(firstTeam.status, "filled");
    assert.equal(firstTeam.teamName, "Team 1");
    assert.equal(firstTeam.teamId, "team-1");
  });

  test("builds team slots with pending invites", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 0 }
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [
      {
        id: "invite-1",
        email: "owner1@example.com",
        status: "pending",
        team: {
          id: "team-1",
          name: "Lightning Bolts"
        },
        owner: {
          id: "owner-1", 
          name: "John Smith"
        },
        delivery: null
      } as CommissionerInviteRow,
      {
        id: "invite-2",
        email: "owner2@example.com", 
        status: "pending",
        team: null,
        owner: null,
        delivery: {
          state: "delivery_failed",
          detail: "Invalid email address"
        }
      } as CommissionerInviteRow
    ];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    assert.equal(slots.length, 12, "Should create 12 total slots");
    assert.equal(slots.filter(s => s.status === "pending_invite").length, 2, "Should have 2 pending invite slots");
    assert.equal(slots.filter(s => s.status === "open").length, 10, "Should have 10 open slots");
    
    // Verify first invite slot
    const inviteSlot1 = slots[0];
    assert.equal(inviteSlot1.status, "pending_invite");
    assert.equal(inviteSlot1.teamName, "Lightning Bolts");
    assert.equal(inviteSlot1.ownerName, "John Smith");
    assert.equal(inviteSlot1.ownerEmail, "owner1@example.com");
    assert.equal(inviteSlot1.inviteId, "invite-1");
    
    // Verify second invite slot with delivery failure
    const inviteSlot2 = slots[1];  
    assert.equal(inviteSlot2.status, "pending_invite");
    assert.equal(inviteSlot2.teamName, null);
    assert.equal(inviteSlot2.ownerEmail, "owner2@example.com");
    assert.equal(inviteSlot2.inviteDeliveryState, "delivery_failed");
    assert.equal(inviteSlot2.inviteDeliveryDetail, "Invalid email address");
  });

  test("builds team slots with mixed teams and invites", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 2 }
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [
      {
        id: "invite-1",
        email: "owner3@example.com",
        status: "pending", 
        team: {
          id: "team-3",
          name: "Storm Chasers"
        },
        owner: null,
        delivery: null
      } as CommissionerInviteRow
    ];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    assert.equal(slots.length, 12, "Should create 12 total slots");
    assert.equal(slots.filter(s => s.status === "filled").length, 2, "Should have 2 filled slots");
    assert.equal(slots.filter(s => s.status === "pending_invite").length, 1, "Should have 1 pending invite slot");
    assert.equal(slots.filter(s => s.status === "open").length, 9, "Should have 9 open slots");
    
    // Verify slot ordering
    assert.equal(slots[0].status, "filled");
    assert.equal(slots[1].status, "filled");
    assert.equal(slots[2].status, "pending_invite");
    assert.equal(slots[3].status, "open");
  });

  test("filters out accepted invites from slot generation", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 1 }
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [
      {
        id: "invite-1",
        email: "owner1@example.com",
        status: "accepted",  // This should be filtered out
        team: { id: "team-2", name: "Accepted Team" },
        owner: { id: "owner-1", name: "Accepted Owner" },
        delivery: null
      } as CommissionerInviteRow,
      {
        id: "invite-2", 
        email: "owner2@example.com",
        status: "pending",  // This should be included
        team: { id: "team-3", name: "Pending Team" },
        owner: null,
        delivery: null
      } as CommissionerInviteRow
    ];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    assert.equal(slots.filter(s => s.status === "pending_invite").length, 1, "Should only have 1 pending invite slot");
    assert.equal(slots.find(s => s.teamName === "Accepted Team"), undefined, "Should not include accepted invites");
    assert.equal(slots.find(s => s.teamName === "Pending Team")?.status, "pending_invite", "Should include pending invite");
  });

  test("builds league members summary with correct calculations", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 0 },
        league: { name: "Test League" }
      }
    } as any;
    
    // Create mock team slots representing different states
    const teamSlots = [
      { status: "filled", teamName: "Team 1", slotNumber: 1 },
      { status: "filled", teamName: "Team 2", slotNumber: 2 },
      { status: "pending_invite", teamName: "Team 3", slotNumber: 3 },
      { status: "pending_invite", teamName: null, slotNumber: 4 },  // Invite without team
      { status: "open", teamName: null, slotNumber: 5 },
      { status: "open", teamName: null, slotNumber: 6 }
    ] as any[];
    
    const summary = buildLeagueMembersSummary(dashboard, teamSlots);
    
    assert.equal(summary.totalSlots, 6, "Total slots should match team slots length");
    assert.equal(summary.filledSlots, 2, "Should count filled slots correctly");
    assert.equal(summary.pendingInvites, 2, "Should count pending invites correctly");
    assert.equal(summary.openSlots, 2, "Should count open slots correctly");
    assert.equal(summary.createdTeams, 3, "Should count teams (filled + pending with team name)");
    assert.equal(summary.leagueName, "Test League", "Should include league name from dashboard");
  });

  test("handles various invite delivery states", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 0 }
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [
      {
        id: "invite-1",
        email: "success@example.com",
        status: "pending",
        team: { id: "team-1", name: "Success Team" },
        owner: null,
        delivery: { state: "delivered", detail: null }
      } as CommissionerInviteRow,
      {
        id: "invite-2",
        email: "failed@example.com",
        status: "pending",
        team: { id: "team-2", name: "Failed Team" },
        owner: null,
        delivery: { state: "delivery_failed", detail: "SMTP error: Connection refused" }
      } as CommissionerInviteRow,
      {
        id: "invite-3",
        email: "local@example.com",
        status: "pending",
        team: { id: "team-3", name: "Local Team" },
        owner: null,
        delivery: { state: "not_configured", detail: "Email delivery disabled in development environment" }
      } as CommissionerInviteRow
    ];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    const deliveredSlot = slots.find(s => s.ownerEmail === "success@example.com");
    assert.equal(deliveredSlot?.inviteDeliveryState, "delivered");
    assert.equal(deliveredSlot?.inviteDeliveryDetail, null);
    
    const failedSlot = slots.find(s => s.ownerEmail === "failed@example.com");
    assert.equal(failedSlot?.inviteDeliveryState, "delivery_failed");
    assert.ok(failedSlot?.inviteDeliveryDetail?.includes("SMTP error"));
    
    const localSlot = slots.find(s => s.ownerEmail === "local@example.com");
    assert.equal(localSlot?.inviteDeliveryState, "not_configured");
    assert.ok(localSlot?.inviteDeliveryDetail?.includes("development environment"));
  });

  test("handles revoked and expired invites", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 0 }
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [
      {
        id: "invite-1", 
        email: "revoked@example.com",
        status: "revoked",
        team: { id: "team-1", name: "Revoked Team" },
        owner: null,
        delivery: null
      } as CommissionerInviteRow,
      {
        id: "invite-2",
        email: "expired@example.com", 
        status: "expired",
        team: { id: "team-2", name: "Expired Team" },
        owner: null,
        delivery: null
      } as CommissionerInviteRow
    ];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    assert.equal(slots.length, 12, "Should create full slot count");
    assert.equal(slots.filter(s => s.status === "pending_invite").length, 2, "Should include revoked/expired as pending_invite");
    
    const revokedSlot = slots.find(s => s.ownerEmail === "revoked@example.com");
    assert.equal(revokedSlot?.inviteStatus, "revoked");
    
    const expiredSlot = slots.find(s => s.ownerEmail === "expired@example.com");
    assert.equal(expiredSlot?.inviteStatus, "expired");
  });

  test("handles edge case: more teams than default slot count", () => {
    const dashboard: LeagueLandingDashboardProjection = {
      leagueDashboard: {
        summary: { teamCount: 15 }  // More than default 12
      }
    } as any;
    
    const invites: CommissionerInviteRow[] = [
      {
        id: "invite-1",
        email: "owner16@example.com", 
        status: "pending",
        team: { id: "team-16", name: "Team 16" },
        owner: null,
        delivery: null
      } as CommissionerInviteRow
    ];
    
    const slots = buildTeamSlotsFromDashboard(dashboard, invites);
    
    assert.equal(slots.length, 16, "Should expand slot count to accommodate teams + invites");
    assert.equal(slots.filter(s => s.status === "filled").length, 15, "Should have 15 filled slots");
    assert.equal(slots.filter(s => s.status === "pending_invite").length, 1, "Should have 1 pending invite slot");
    assert.equal(slots.filter(s => s.status === "open").length, 0, "Should have no open slots");
  });

});