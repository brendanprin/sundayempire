import { InviteDeliveryState, Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  AUTH_PLATFORM_INVITE_DEFAULT_TTL_DAYS,
  AUTH_PLATFORM_INVITE_TOKEN_PARAM,
} from "@/lib/auth-constants";
import {
  maskEmailAddress,
  normalizeEmailDeliveryResult,
  resolveEmailAppOrigin,
  type EmailDeliveryResult,
} from "@/lib/email/EmailDeliveryService";
import { buildJoinPath } from "@/lib/return-to";
import { prisma } from "@/lib/prisma";
import { logRuntime } from "@/lib/runtime-log";
import {
  buildOpaqueToken,
  hashOpaqueTokenSecret,
  opaqueTokenHashesEqual,
  parseOpaqueToken,
} from "./token-utils";
import {
  createPlatformInviteDelivery,
  type PlatformInviteDelivery,
} from "./PlatformInviteDelivery";
import {
  createPlatformInviteRepository,
  type PlatformInviteRecord,
} from "./PlatformInviteRepository";

type PlatformInviteDbClient = PrismaClient | Prisma.TransactionClient;

function supportsTransactionClient(value: PlatformInviteDbClient): value is PrismaClient {
  return "$transaction" in value;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

type InviteDeliveryView = {
  state: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown";
  label: string;
  detail: string;
  attemptedAt: Date | null;
  canRetry: boolean;
  inviteStillValid: boolean;
};

export type PlatformInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type ManagedPlatformInvite = {
  id: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  invitedByUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  delivery: InviteDeliveryView | null;
  status: PlatformInviteStatus;
  canResend: boolean;
  canRevoke: boolean;
};

export type CreatePlatformInviteResult = {
  invite: PlatformInviteRecord;
  inviteUrl: string;
  delivery: EmailDeliveryResult;
  deliveryView: InviteDeliveryView;
};

export type PlatformInviteLandingState =
  | { status: "invalid"; invite: null }
  | { status: "expired" | "revoked" | "accepted" | "pending"; invite: PlatformInviteRecord };

type PlatformInviteAcceptanceErrorCode =
  | "INVALID_INVITE"
  | "EXPIRED_INVITE"
  | "REVOKED_INVITE"
  | "INVITE_ALREADY_ACCEPTED"
  | "INVITE_EMAIL_MISMATCH";

export class PlatformInviteAcceptanceError extends Error {
  code: PlatformInviteAcceptanceErrorCode;
  constructor(code: PlatformInviteAcceptanceErrorCode) {
    super(code);
    this.name = "PlatformInviteAcceptanceError";
    this.code = code;
  }
}

type PlatformInviteManagementErrorCode =
  | "INVITE_NOT_FOUND"
  | "INVITE_ALREADY_ACCEPTED"
  | "INVITE_REVOKED"
  | "INVITE_REVOKE_NOT_ALLOWED";

export class PlatformInviteManagementError extends Error {
  code: PlatformInviteManagementErrorCode;
  constructor(code: PlatformInviteManagementErrorCode) {
    super(code);
    this.name = "PlatformInviteManagementError";
    this.code = code;
  }
}

export type PlatformInviteServiceOptions = {
  now?: () => Date;
  tokenFactory?: () => string;
  inviteTtlMs?: number;
  delivery?: PlatformInviteDelivery;
};

function derivePlatformInviteStatus(
  invite: Pick<PlatformInviteRecord, "acceptedAt" | "revokedAt" | "expiresAt">,
  currentTime: Date,
): PlatformInviteStatus {
  if (invite.acceptedAt) return "accepted";
  if (invite.revokedAt) return "revoked";
  if (invite.expiresAt.getTime() <= currentTime.getTime()) return "expired";
  return "pending";
}

function toStoredDeliveryState(
  state: ReturnType<typeof normalizeEmailDeliveryResult>["state"],
): InviteDeliveryState {
  switch (state) {
    case "captured": return InviteDeliveryState.CAPTURED;
    case "logged": return InviteDeliveryState.LOGGED;
    case "failed": return InviteDeliveryState.FAILED;
    case "not_configured": return InviteDeliveryState.NOT_CONFIGURED;
    default: return InviteDeliveryState.SENT;
  }
}

function toPublicDeliveryState(
  state: InviteDeliveryState | null,
): InviteDeliveryView["state"] {
  switch (state) {
    case InviteDeliveryState.CAPTURED: return "captured";
    case InviteDeliveryState.LOGGED: return "logged";
    case InviteDeliveryState.FAILED: return "failed";
    case InviteDeliveryState.NOT_CONFIGURED: return "not_configured";
    case InviteDeliveryState.SENT: return "sent";
    default: return "unknown";
  }
}

function buildDeliveryView(input: {
  invite: Pick<PlatformInviteRecord, "lastDeliveryAttemptedAt" | "lastDeliveryState" | "lastDeliveryErrorCode">;
  status: PlatformInviteStatus;
  canRetry: boolean;
}): InviteDeliveryView | null {
  if (!input.invite.lastDeliveryState && !input.invite.lastDeliveryAttemptedAt) {
    return null;
  }

  const state = toPublicDeliveryState(input.invite.lastDeliveryState);
  const inviteStillValid = input.status === "pending";

  const detailMap: Record<InviteDeliveryView["state"], string> = {
    sent: inviteStillValid
      ? "Email sent. Waiting for the invitee to accept."
      : `Email was sent (status: ${input.status}).`,
    captured: inviteStillValid
      ? "Test capture active. No real email was sent."
      : `Test capture was active when issued (status: ${input.status}).`,
    logged: inviteStillValid
      ? "Logged to server console. No real email was sent."
      : `Logged to console when issued (status: ${input.status}).`,
    not_configured:
      "Email delivery is not configured. The invite is still valid and can be resent.",
    failed: inviteStillValid
      ? "Delivery failed. The invite is still valid — use Resend to try again."
      : `Delivery failed (status: ${input.status}).`,
    unknown: "No delivery record available yet.",
  };

  return {
    state,
    label: state === "sent" ? "Sent"
      : state === "captured" ? "Test capture"
      : state === "logged" ? "Console log"
      : state === "not_configured" ? "Delivery unavailable"
      : state === "failed" ? "Delivery failed"
      : "Unknown",
    detail: detailMap[state],
    attemptedAt: input.invite.lastDeliveryAttemptedAt,
    canRetry: input.canRetry,
    inviteStillValid,
  };
}

function buildJoinUrl(input: { origin: string; token: string }) {
  return new URL(
    buildJoinPath({ token: input.token }),
    input.origin,
  ).toString();
}

async function loadInviteFromToken(
  repository: ReturnType<typeof createPlatformInviteRepository>,
  token: string,
): Promise<PlatformInviteRecord | null> {
  const parsed = parseOpaqueToken(token);
  if (!parsed) return null;

  const invite = await repository.findById(parsed.recordId);
  if (!invite) return null;

  const tokenHash = hashOpaqueTokenSecret(parsed.secret);
  if (!opaqueTokenHashesEqual(invite.tokenHash, tokenHash)) return null;

  return invite;
}

export function readPlatformInviteTokenFromSearchParams(searchParams: URLSearchParams) {
  return searchParams.get(AUTH_PLATFORM_INVITE_TOKEN_PARAM)?.trim() ?? "";
}

export function createPlatformInviteService(
  client: PlatformInviteDbClient = prisma,
  options: PlatformInviteServiceOptions = {},
) {
  const repository = createPlatformInviteRepository(client);
  const delivery = options.delivery ?? createPlatformInviteDelivery();
  const now = options.now ?? (() => new Date());
  const tokenFactory = options.tokenFactory ?? (() => randomBytes(32).toString("base64url"));
  const inviteTtlMs =
    options.inviteTtlMs ?? AUTH_PLATFORM_INVITE_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;

  function toManagedInvite(invite: PlatformInviteRecord, currentTime: Date): ManagedPlatformInvite {
    const status = derivePlatformInviteStatus(invite, currentTime);
    const canResend = status === "pending" || status === "expired";
    return {
      id: invite.id,
      email: invite.email,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
      invitedByUser: invite.invitedByUser,
      delivery: buildDeliveryView({ invite, status, canRetry: canResend }),
      status,
      canResend,
      canRevoke: status === "pending",
    };
  }

  async function createInvite(input: {
    email: string;
    invitedByUserId?: string | null;
    origin: string;
    deliveryKind?: "initial" | "resend";
  }): Promise<CreatePlatformInviteResult> {
    const email = normalizeEmail(input.email);
    const currentTime = now();
    const secret = tokenFactory().trim();
    if (secret.length === 0) throw new Error("Platform invite token secret must not be empty.");

    const expiresAt = new Date(currentTime.getTime() + inviteTtlMs);
    const invite = await repository.create({
      email,
      tokenHash: hashOpaqueTokenSecret(secret),
      expiresAt,
      invitedByUserId: input.invitedByUserId ?? null,
    });

    const inviteUrl = buildJoinUrl({
      origin: resolveEmailAppOrigin(input.origin),
      token: buildOpaqueToken(invite.id, secret),
    });

    const inviterRecord = invite.invitedByUser;
    const deliveryResult = await delivery.send({
      email,
      inviteUrl,
      invitedByName: inviterRecord?.name ?? null,
      invitedByEmail: inviterRecord?.email ?? null,
      expiresAt,
      deliveryKind: input.deliveryKind ?? "initial",
    });

    const normalizedDelivery = normalizeEmailDeliveryResult(deliveryResult);
    const deliveryAttemptedAt = now();
    const inviteWithDelivery = await repository.recordDeliveryAttempt({
      id: invite.id,
      attemptedAt: deliveryAttemptedAt,
      state: toStoredDeliveryState(normalizedDelivery.state),
      errorCode: normalizedDelivery.errorCode,
    });

    const deliveryView =
      buildDeliveryView({ invite: inviteWithDelivery, status: "pending", canRetry: true }) ??
      buildDeliveryView({
        invite: {
          lastDeliveryAttemptedAt: deliveryAttemptedAt,
          lastDeliveryState: toStoredDeliveryState(normalizedDelivery.state),
          lastDeliveryErrorCode: normalizedDelivery.errorCode,
        } as Pick<PlatformInviteRecord, "lastDeliveryAttemptedAt" | "lastDeliveryState" | "lastDeliveryErrorCode">,
        status: "pending",
        canRetry: true,
      })!;

    logRuntime(deliveryResult.ok ? "info" : "warn", {
      event: "auth.platform_invite.delivery_recorded",
      inviteId: invite.id,
      recipient: maskEmailAddress(email),
      deliveryKind: input.deliveryKind ?? "initial",
      deliveryState: normalizedDelivery.state,
      deliveryErrorCode: normalizedDelivery.errorCode,
    });

    return { invite: inviteWithDelivery, inviteUrl, delivery: deliveryResult, deliveryView };
  }

  async function getInviteLandingState(token: string): Promise<PlatformInviteLandingState> {
    const invite = await loadInviteFromToken(repository, token);
    if (!invite) return { status: "invalid", invite: null };
    return { status: derivePlatformInviteStatus(invite, now()), invite };
  }

  async function findLatestPendingByEmail(email: string): Promise<PlatformInviteRecord | null> {
    return repository.findLatestPendingByEmail(normalizeEmail(email), now());
  }

  async function listInvitesSentByUser(userId: string): Promise<ManagedPlatformInvite[]> {
    const currentTime = now();
    const invites = await repository.listBySentByUserId(userId);
    return invites.map((invite) => toManagedInvite(invite, currentTime));
  }

  async function acceptInvite(input: {
    token: string;
    userId: string;
    userEmail: string;
  }): Promise<PlatformInviteRecord> {
    const execute = async (txClient: PlatformInviteDbClient) => {
      const txRepository = createPlatformInviteRepository(txClient);
      const currentTime = now();

      const invite = await loadInviteFromToken(txRepository, input.token);
      if (!invite) throw new PlatformInviteAcceptanceError("INVALID_INVITE");

      const status = derivePlatformInviteStatus(invite, currentTime);
      if (status === "expired") throw new PlatformInviteAcceptanceError("EXPIRED_INVITE");
      if (status === "revoked") throw new PlatformInviteAcceptanceError("REVOKED_INVITE");
      if (status === "accepted") throw new PlatformInviteAcceptanceError("INVITE_ALREADY_ACCEPTED");

      if (normalizeEmail(input.userEmail) !== invite.email) {
        throw new PlatformInviteAcceptanceError("INVITE_EMAIL_MISMATCH");
      }

      const didAccept = await txRepository.acceptIfAvailable(invite.id, currentTime, currentTime);
      if (!didAccept) throw new PlatformInviteAcceptanceError("INVITE_ALREADY_ACCEPTED");

      const accepted = await txRepository.findById(invite.id);
      if (!accepted) throw new PlatformInviteAcceptanceError("INVALID_INVITE");
      return accepted;
    };

    if (supportsTransactionClient(client)) {
      return client.$transaction((tx) => execute(tx));
    }
    return execute(client);
  }

  async function revokeInvite(inviteId: string): Promise<ManagedPlatformInvite> {
    const execute = async (txClient: PlatformInviteDbClient) => {
      const txRepository = createPlatformInviteRepository(txClient);
      const currentTime = now();
      const invite = await txRepository.findById(inviteId);
      if (!invite) throw new PlatformInviteManagementError("INVITE_NOT_FOUND");

      const status = derivePlatformInviteStatus(invite, currentTime);
      if (status !== "pending") {
        if (status === "accepted") throw new PlatformInviteManagementError("INVITE_ALREADY_ACCEPTED");
        if (status === "revoked") throw new PlatformInviteManagementError("INVITE_REVOKED");
        throw new PlatformInviteManagementError("INVITE_REVOKE_NOT_ALLOWED");
      }

      const didRevoke = await txRepository.revokeIfAvailable(inviteId, currentTime, currentTime);
      if (!didRevoke) throw new PlatformInviteManagementError("INVITE_REVOKE_NOT_ALLOWED");

      const revoked = await txRepository.findById(inviteId);
      if (!revoked) throw new PlatformInviteManagementError("INVITE_NOT_FOUND");
      return toManagedInvite(revoked, currentTime);
    };

    if (supportsTransactionClient(client)) {
      return client.$transaction((tx) => execute(tx));
    }
    return execute(client);
  }

  async function resendInvite(input: {
    inviteId: string;
    origin: string;
    invitedByUserId?: string | null;
  }): Promise<CreatePlatformInviteResult> {
    const execute = async (txClient: PlatformInviteDbClient) => {
      const txRepository = createPlatformInviteRepository(txClient);
      const currentTime = now();
      const invite = await txRepository.findById(input.inviteId);
      if (!invite) throw new PlatformInviteManagementError("INVITE_NOT_FOUND");

      const status = derivePlatformInviteStatus(invite, currentTime);
      if (status === "accepted") throw new PlatformInviteManagementError("INVITE_ALREADY_ACCEPTED");
      if (status === "revoked") throw new PlatformInviteManagementError("INVITE_REVOKED");

      if (status === "pending") {
        const didRevoke = await txRepository.revokeIfAvailable(invite.id, currentTime, currentTime);
        if (!didRevoke) throw new PlatformInviteManagementError("INVITE_REVOKE_NOT_ALLOWED");
      }

      await txRepository.revokePendingByEmail(invite.email, currentTime, currentTime, invite.id);

      return createPlatformInviteService(txClient, { now, tokenFactory, inviteTtlMs, delivery })
        .createInvite({
          email: invite.email,
          invitedByUserId: input.invitedByUserId ?? invite.invitedByUserId ?? null,
          origin: input.origin,
          deliveryKind: "resend",
        });
    };

    if (supportsTransactionClient(client)) {
      return client.$transaction((tx) => execute(tx));
    }
    return execute(client);
  }

  return {
    createInvite,
    getInviteLandingState,
    findLatestPendingByEmail,
    listInvitesSentByUser,
    acceptInvite,
    revokeInvite,
    resendInvite,
  };
}
