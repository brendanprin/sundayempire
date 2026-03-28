export const PILOT_EVENT_CATEGORIES = [
  "trade",
  "roster",
  "commissioner",
  "feedback",
] as const;

export type PilotEventCategory = (typeof PILOT_EVENT_CATEGORIES)[number] | "ui";

export const PILOT_EVENT_TYPES = {
  TRADE_PROPOSAL_CREATED: "trade.proposal.created",
  TRADE_ACCEPTED: "trade.accepted",
  TRADE_REJECTED: "trade.rejected",
  TRADE_PROCESSED: "trade.processed",
  ROSTER_SWAP_COMPLETED: "roster.swap.completed",
  ROSTER_MOVE_COMPLETED: "roster.move.completed",
  ROSTER_ADD_COMPLETED: "roster.add.completed",
  ROSTER_DROP_COMPLETED: "roster.drop.completed",
  ROSTER_CUT_COMPLETED: "roster.cut.completed",
  COMMISSIONER_PHASE_TRANSITION: "commissioner.phase.transition",
  COMMISSIONER_COMPLIANCE_SCAN: "commissioner.compliance.scan",
  COMMISSIONER_ROLLOVER_PREVIEW: "commissioner.rollover.preview",
  COMMISSIONER_ROLLOVER_APPLY: "commissioner.rollover.apply",
  COMMISSIONER_FIX_PREVIEW: "commissioner.fix.preview",
  COMMISSIONER_FIX_APPLY: "commissioner.fix.apply",
  COMMISSIONER_SNAPSHOT_PREVIEW: "commissioner.snapshot.preview",
  COMMISSIONER_SNAPSHOT_APPLY: "commissioner.snapshot.apply",
  PILOT_FEEDBACK_SUBMITTED: "feedback.submitted",
  UI_NAV_LINK_SELECTED: "ui.nav.link.selected",
  UI_DASHBOARD_VIEWED: "ui.dashboard.viewed",
  UI_DASHBOARD_ACTION_SELECTED: "ui.dashboard.action.selected",
  UI_DASHBOARD_FIRST_ACTION: "ui.dashboard.first_action",
  UI_LEAGUE_DIRECTORY_VIEWED: "ui.league.directory.viewed",
  UI_LEAGUE_SELECTED: "ui.league.selected",
  UI_LEAGUE_HOME_VIEWED: "ui.league.home.viewed",
  UI_LEAGUE_HOME_FIRST_ACTION: "ui.league.home.first_action",
  UI_LEAGUE_SWITCHED: "ui.league.switched",
  UI_TEAM_BROWSE_VIEWED: "ui.team.browse.viewed",
  UI_TEAM_BLOCKED_MUTATION: "ui.team.blocked_mutation",
  UI_TEAM_FOLLOWUP_NAVIGATED: "ui.team.followup.navigated",
  UI_DRAFT_LAUNCHER_VIEWED: "ui.draft.launcher.viewed",
  UI_DRAFT_TYPE_SELECTED: "ui.draft.type.selected",
  UI_DRAFT_TYPE_VIEWED: "ui.draft.type.viewed",
  UI_DRAFT_SESSION_SELECTED: "ui.draft.session.selected",
  UI_DRAFT_LIFECYCLE_ACTION: "ui.draft.lifecycle.action",
  UI_AUTH_LOGIN_VIEWED: "ui.auth.login.viewed",
  UI_AUTH_MAGIC_LINK_REQUESTED: "ui.auth.magic_link.requested",
  UI_AUTH_SIGN_IN_SUCCESS: "ui.auth.sign_in.success",
  UI_AUTH_SIGN_IN_FAILURE: "ui.auth.sign_in.failure",
  UI_AUTH_SESSION_RESET: "ui.auth.session.reset",
  UI_AUTH_RETURN_TO_REDIRECT: "ui.auth.return_to.redirect",
  UI_SUPPORT_WORKSPACE_OPENED: "ui.support.workspace.opened",
  UI_SUPPORT_TRIAGE_LINK_COPIED: "ui.support.triage_link.copied",
  UI_SUPPORT_DEEP_LINK_OPENED_FROM_DIAGNOSTICS:
    "ui.support.deep_link.opened_from_diagnostics",
  UI_SUPPORT_DEEP_LINK_OPENED_FROM_GOVERNANCE:
    "ui.support.deep_link.opened_from_governance",
  UI_SUPPORT_REPAIR_SUBMITTED: "ui.support.repair.submitted",
} as const;

export type PilotEventType = (typeof PILOT_EVENT_TYPES)[keyof typeof PILOT_EVENT_TYPES];

export function isPilotEventType(value: unknown): value is PilotEventType {
  if (typeof value !== "string") {
    return false;
  }

  return Object.values(PILOT_EVENT_TYPES).includes(value as PilotEventType);
}

export const PILOT_FEEDBACK_CATEGORIES = [
  "UX_FRICTION",
  "BUG",
  "SUGGESTION",
  "QUESTION",
] as const;

export type PilotFeedbackCategory = (typeof PILOT_FEEDBACK_CATEGORIES)[number];

export const PILOT_FEEDBACK_SEVERITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export type PilotFeedbackSeverity = (typeof PILOT_FEEDBACK_SEVERITIES)[number];

export function isPilotFeedbackCategory(value: unknown): value is PilotFeedbackCategory {
  if (typeof value !== "string") {
    return false;
  }

  return PILOT_FEEDBACK_CATEGORIES.includes(value as PilotFeedbackCategory);
}

export function isPilotFeedbackSeverity(value: unknown): value is PilotFeedbackSeverity {
  if (typeof value !== "string") {
    return false;
  }

  return PILOT_FEEDBACK_SEVERITIES.includes(value as PilotFeedbackSeverity);
}
