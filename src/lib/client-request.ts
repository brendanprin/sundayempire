export type ApiErrorPayload = {
  error?: {
    code?: string;
    message?: string;
    context?: Record<string, unknown> | null;
  };
  message?: string;
};

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly context: Record<string, unknown> | null;

  constructor(input: {
    message: string;
    status: number;
    code?: string | null;
    context?: Record<string, unknown> | null;
  }) {
    super(input.message);
    this.name = "ApiRequestError";
    this.status = input.status;
    this.code = input.code?.trim() || null;
    this.context = input.context ?? null;
  }
}

const OPERATOR_ERROR_CODE_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "Request details are invalid. Review required fields and try again.",
  LEAGUE_CONTEXT_NOT_FOUND: "No active league context is available. Verify seed/setup state first.",
  TEAM_NOT_FOUND: "Team was not found in the active league.",
  OWNER_NOT_FOUND: "Owner record was not found.",
  PLAYER_NOT_FOUND: "Player record was not found.",
  CONTRACT_NOT_FOUND: "Contract record was not found for the active season.",
  CONTRACT_EXISTS: "Player already has an active-season contract.",
  CONTRACT_CONSTRAINT_VIOLATION: "Contract terms violate league rules. Adjust salary/years and retry.",
  ROOKIE_OPTION_NOT_AVAILABLE: "Rookie option is not available for that contract.",
  FRANCHISE_TAG_NOT_AVAILABLE: "Franchise tag is not available for that contract.",
  COMPLIANCE_VIOLATION:
    "Operation would introduce new compliance errors. Resolve current roster/cap issues first.",
  ROSTER_SLOT_CONFLICT:
    "Roster move conflicts with current slot usage. Select a different slot or swap players.",
  ROSTER_PLAYER_NOT_FOUND: "Player is not on this team roster in the active season.",
  DRAFT_NOT_FOUND: "Draft record was not found.",
  DRAFT_STATE_CONFLICT: "Draft is not in the required state for this action.",
  DRAFT_PICK_INVALID: "Pick is not currently valid. Refresh board state and retry.",
  TRADE_NOT_FOUND: "Trade proposal was not found.",
  TRADE_STATE_CONFLICT: "Trade is not in a mutable state for this action.",
  SNAPSHOT_INVALID: "Snapshot payload is invalid. Verify JSON and required entities.",
  INVALID_SNAPSHOT: "Snapshot payload is invalid. Verify JSON and required entities.",
  INVALID_IMPORT_MODE: "Snapshot import mode is invalid. Use preview or apply.",
  REPLACE_EXISTING_REQUIRED: "Snapshot apply requires replaceExisting=true.",
  SNAPSHOT_PREVIEW_REQUIRED: "Run preview for the exact snapshot payload before apply.",
  SNAPSHOT_PREVIEW_MISMATCH: "Snapshot changed after preview. Re-run preview before apply.",
  SNAPSHOT_SOURCE_LEAGUE_MISMATCH:
    "Snapshot source league does not match the active league context.",
  LEAGUE_CONTEXT_NOT_READY:
    "Selected league is missing active season/ruleset setup.",
  TEAM_ALREADY_EXISTS:
    "A team with that name or abbreviation already exists in the active league.",
  INVITE_CONFLICT:
    "Owner invite conflicts with an existing league membership.",
  INVITE_NOT_FOUND: "This invite link is invalid or could not be found.",
  INVITE_EXPIRED: "This invite link has expired. Ask your commissioner for a new invite.",
  INVITE_REVOKED: "This invite link has been revoked.",
  INVITE_ALREADY_ACCEPTED: "This invite link has already been accepted.",
  INVITE_EMAIL_MISMATCH:
    "You must sign in with the invited email address before accepting this invite.",
  AUTH_REQUIRED: "You must be signed in to perform this action.",
  FORBIDDEN: "You do not have permission for this action.",
  LEAGUE_MEMBERSHIP_NOT_FOUND: "No league membership was found for this user.",
  COMPLIANCE_ISSUE_NOT_FOUND: "Compliance issue was not found.",
  OVERRIDE_REASON_REQUIRED: "Commissioner overrides require a written reason.",
  INVALID_SYNC_ADAPTER: "Sync adapter is invalid. Use a supported provider or CSV/manual fallback.",
  SYNC_IMPORT_REQUIRED: "Provide at least one roster or transaction import payload.",
  SYNC_JOB_NOT_FOUND: "Sync job was not found.",
  SYNC_MISMATCH_NOT_FOUND: "Sync mismatch was not found.",
  SYNC_MISMATCH_STATE_CONFLICT: "Sync mismatch is not in the required state for this action.",
  SYNC_MISMATCH_NOT_ESCALATABLE: "Only open high-impact mismatches can escalate to compliance.",
  INVALID_PLAYER_DIRECTORY_ADAPTER:
    "Player refresh adapter is invalid. Use a supported player directory adapter.",
  PLAYER_REFRESH_CONTEXT_NOT_FOUND:
    "Player refresh context could not be resolved for the active league.",
  PLAYER_REFRESH_JOB_NOT_FOUND: "Player refresh job was not found.",
  PLAYER_REFRESH_CHANGE_NOT_FOUND: "Player refresh change was not found.",
  PLAYER_REFRESH_CHANGE_STATE_CONFLICT:
    "That player refresh change has already been reviewed. Refresh the job detail and try again.",
  PLAYER_REFRESH_CHANGE_NOT_RESOLVABLE:
    "This refresh row cannot be applied automatically. Reject it or rerun with corrected source data.",
  PLAYER_REFRESH_TARGET_REQUIRED:
    "Choose a canonical player before applying this review decision.",
  PLAYER_IDENTITY_MAPPING_CONFLICT:
    "That provider identity is already approved for a different canonical player.",
  DRAFT_SETUP_REQUIRED:
    "Draft setup must be completed before this action can proceed.",
  EMERGENCY_POOL_REQUIRED:
    "Emergency fill-in mode requires at least one eligible player.",
  AUCTION_POOL_FINALIZED:
    "The auction pool is finalized and cannot be regenerated without an explicit recovery workflow.",
  AUCTION_POOL_RECOVERY_REQUIRED:
    "Live auction activity blocks regeneration. Use an explicit recovery workflow before rewriting the pool.",
  AUCTION_POOL_NOT_READY:
    "The auction pool is not ready to finalize yet. Generate and review at least one eligible player first.",
  AUCTION_POOL_FINALIZATION_REQUIRED:
    "Finalize the veteran auction pool before opening the auction.",
  AUCTION_POOL_EMPTY:
    "Generate at least one eligible veteran before opening the auction.",

  // VA-S12: Enhanced bid rejection error messages
  WRONG_ENTRY_STATUS: "This player is not available for bidding at this time.",
  BID_WINDOW_CLOSED: "The bidding window for this player has already closed.",  
  INSUFFICIENT_RAISE: "Your bid amount is too low based on the current leading bid.",
  BID_VALUE_TOO_LOW: "Your bid does not meet the constitutional minimum value requirements.",
  AUCTION_NOT_ACTIVE: "The auction is not currently accepting new bids.",
  INVALID_BID_AMOUNT: "The bid amount entered is not valid.",
  INSUFFICIENT_BUDGET: "This bid exceeds your available cap space.",
  PLAYER_NOT_AVAILABLE: "This player is not available for auction.",
};

// VA-S12 + VA-S13: Enhanced bid rejection context extraction
export function extractBidRejectionContext(payload: unknown): {
  rejectionType?: string;
  context?: Record<string, unknown>;
  friendlyMessage?: string;
} {
  if (payload && typeof payload === "object") {
    const typed = payload as ApiErrorPayload & {
      error?: {
        code?: string;
        context?: {
          rejectionType?: string;
          context?: Record<string, unknown>;
          poolEntryStatus?: string;
          currentLeadingBid?: {
            salaryAmount: number;
            contractYears: number;
          };
          minimumBidAmount?: number;
          // VA-S13: Additional context for salary/years validation
          currentLeadingSalary?: number;
          proposedSalary?: number;
          minimumRequired?: number;
          incrementRequired?: number;
          minimumSalary?: number;
          minimumYears?: number;
          maximumYears?: number;
          maxYearsForLowSalary?: number;
          rule?: string;
          auctionStatus?: string;
          auctionEndsAt?: string;
          playerName?: string;
        };
      };
    };

    const rejectionType = typed.error?.context?.rejectionType;
    const context = typed.error?.context?.context || {};
    
    // VA-S13: INSUFFICIENT_RAISE explains minimum next salary
    if (rejectionType === "INSUFFICIENT_RAISE") {
      const currentBid = typed.error?.context?.currentLeadingBid;
      const currentSalary = typed.error?.context?.currentLeadingSalary;
      const minRequired = typed.error?.context?.minimumRequired;
      const increment = typed.error?.context?.incrementRequired;
      
      if (currentBid) {
        const minBid = typed.error?.context?.minimumBidAmount || currentBid.salaryAmount + 1;
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. The current leading salary is $${currentBid.salaryAmount.toLocaleString()}, so your next open bid must be at least $${minBid.toLocaleString()}.`
        };
      } else if (currentSalary && minRequired) {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. The current leading salary is $${currentSalary.toLocaleString()}, so your next bid must be at least $${minRequired.toLocaleString()}.`
        };
      } else if (increment) {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. Your bid must be at least $${increment.toLocaleString()} higher than the current leading bid.`
        };
      }
    }
    
    if (rejectionType === "BID_VALUE_TOO_LOW" && typed.error?.context?.minimumBidAmount) {
      const minBid = typed.error.context.minimumBidAmount;
      return {
        rejectionType,
        context,
        friendlyMessage: `Bid not accepted. The minimum constitutional value for this bid is $${minBid.toLocaleString()}.`
      };
    }
    
    // VA-S13: wrong status / closed bidding explains that the player is no longer open for bidding
    if (rejectionType === "WRONG_ENTRY_STATUS") {
      const status = typed.error?.context?.poolEntryStatus;
      const playerName = typed.error?.context?.playerName;
      const playerRef = playerName ? `${playerName}` : "This player";
      
      if (status === "AWARDED") {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. ${playerRef} has already been awarded and is no longer open for bidding.`
        };
      } else if (status === "EXPIRED") {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. ${playerRef} bidding has expired and is no longer open for bidding.`
        };
      } else if (status) {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. ${playerRef} is currently in ${status.toLowerCase()} status and not available for bidding.`
        };
      } else {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. This player is no longer open for bidding.`
        };
      }
    }
    
    if (rejectionType === "BID_WINDOW_CLOSED" || rejectionType === "CLOSED_BID_WINDOW") {
      return {
        rejectionType,
        context,
        friendlyMessage: "Bid not accepted. The bidding window for this player has closed and is no longer open for bidding."
      };
    }
    
    if (rejectionType === "AUCTION_CLOSED") {
      const auctionStatus = typed.error?.context?.auctionStatus;
      if (auctionStatus === "COMPLETED") {
        return {
          rejectionType,
          context,
          friendlyMessage: "Bid not accepted. The auction has concluded and is no longer open for bidding."
        };
      } else {
        return {
          rejectionType,
          context,
          friendlyMessage: "Bid not accepted. The auction is not currently accepting bids."
        };
      }
    }
    
    // VA-S13: invalid years/salary explains what range is allowed
    if (rejectionType === "RULE_VIOLATION") {
      const rule = typed.error?.context?.rule;
      const minSalary = typed.error?.context?.minimumSalary;
      const minYears = typed.error?.context?.minimumYears;
      const maxYears = typed.error?.context?.maximumYears;
      const maxYearsForLowSalary = typed.error?.context?.maxYearsForLowSalary;
      const proposedSalary = typed.error?.context?.proposedSalary;
      
      if (rule?.includes("salary") && minSalary) {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. Salary must be at least $${minSalary.toLocaleString()}.`
        };
      }
      
      if (rule?.includes("years") || rule?.includes("contract")) {
        if (minYears && maxYears && proposedSalary && maxYearsForLowSalary && proposedSalary < 1000000) {
          return {
            rejectionType,
            context,
            friendlyMessage: `Bid not accepted. For salaries under $1M, contract years must be between ${minYears} and ${maxYearsForLowSalary} years. For higher salaries, up to ${maxYears} years allowed.`
          };
        } else if (minYears && maxYears) {
          return {
            rejectionType,
            context,
            friendlyMessage: `Bid not accepted. Contract years must be between ${minYears} and ${maxYears} years.`
          };
        } else if (maxYears) {
          return {
            rejectionType,
            context,
            friendlyMessage: `Bid not accepted. Contract years cannot exceed ${maxYears} years.`
          };
        } else if (minYears) {
          return {
            rejectionType,
            context,
            friendlyMessage: `Bid not accepted. Contract must be at least ${minYears} year${minYears !== 1 ? 's' : ''}.`
          };
        }
      }
      
      if (rule) {
        return {
          rejectionType,
          context,
          friendlyMessage: `Bid not accepted. ${rule}`
        };
      }
    }
    
    if (rejectionType === "CAP_VIOLATION" || rejectionType === "INSUFFICIENT_BUDGET") {
      return {
        rejectionType,
        context,
        friendlyMessage: "Bid not accepted. This bid exceeds your available cap space."
      };
    }
    
    if (rejectionType === "PLAYER_RESTRICTED") {
      return {
        rejectionType,
        context,
        friendlyMessage: "Bid not accepted. This player is restricted and not available for auction."
      };
    }

    // VA-S13: Fallback still shows a generic error if structured context is missing
    if (rejectionType) {
      return {
        rejectionType,
        context,
        friendlyMessage: "Bid not accepted. Please review your bid details and try again."
      };
    }

    return {
      rejectionType,
      context,
      friendlyMessage: undefined
    };
  }
  
  return {};
}

function parseJsonSafely(text: string): unknown {
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text.slice(0, 200),
    };
  }
}

export function extractApiErrorMessage(
  payload: unknown,
  fallbackMessage: string,
): string {
  if (payload && typeof payload === "object") {
    const typed = payload as ApiErrorPayload;
    const errorCode = typed.error?.code?.trim();
    
    // VA-S12: Check for enhanced bid rejection context first
    const bidRejectionContext = extractBidRejectionContext(payload);
    if (bidRejectionContext.friendlyMessage) {
      return bidRejectionContext.friendlyMessage;
    }
    
    const preferServerMessage =
      errorCode === "COMPLIANCE_VIOLATION" || errorCode === "ROSTER_SLOT_CONFLICT";

    if (preferServerMessage && typed.error?.message && typed.error.message.trim()) {
      return typed.error.message;
    }

    if (errorCode && OPERATOR_ERROR_CODE_MESSAGES[errorCode]) {
      return OPERATOR_ERROR_CODE_MESSAGES[errorCode];
    }

    if (typed.error?.message && typed.error.message.trim()) {
      return typed.error.message;
    }
    if (typeof typed.message === "string" && typed.message.trim()) {
      return typed.message;
    }
  }

  return fallbackMessage;
}

function extractApiErrorMetadata(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return {
      code: null,
      context: null,
    };
  }

  const typed = payload as ApiErrorPayload;
  return {
    code: typed.error?.code?.trim() || null,
    context: typed.error?.context ?? null,
  };
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  fallbackMessage?: string,
): Promise<T> {
  const response = await fetch(input, init);
  const rawText = await response.text();
  const payload = parseJsonSafely(rawText);
  const method = init?.method ?? "GET";
  const fallback = fallbackMessage ?? `${method} request failed.`;

  if (!response.ok) {
    const metadata = extractApiErrorMetadata(payload);
    throw new ApiRequestError({
      message: extractApiErrorMessage(payload, fallback),
      status: response.status,
      code: metadata.code,
      context: metadata.context,
    });
  }

  if (
    payload &&
    typeof payload === "object" &&
    "error" in payload &&
    (payload as ApiErrorPayload).error
  ) {
    const metadata = extractApiErrorMetadata(payload);
    throw new ApiRequestError({
      message: extractApiErrorMessage(payload, fallback),
      status: response.status,
      code: metadata.code,
      context: metadata.context,
    });
  }

  return payload as T;
}
