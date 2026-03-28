import {
  InviteDeliveryState,
  LeagueRole,
  Prisma,
  PrismaClient,
  TeamMembershipType,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  AUTH_INVITE_DEFAULT_TTL_DAYS,
  AUTH_INVITE_TOKEN_PARAM,
} from "@/lib/auth-constants";
import {
  maskEmailAddress,
  normalizeEmailDeliveryResult,
  resolveEmailAppOrigin,
  type EmailDeliveryResult,
} from "@/lib/email/EmailDeliveryService";
import { buildInvitePath } from "@/lib/return-to";
import { prisma } from "@/lib/prisma";
import { logRuntime } from "@/lib/runtime-log";
import { createTeamMembershipRepository } from "@/lib/domain/team-membership/repository";
import { promoteLeagueMemberToCommissioner } from "@/lib/domain/league-membership/commissioner-assignment";
import {
  buildOpaqueToken,
  hashOpaqueTokenSecret,
  opaqueTokenHashesEqual,
  parseOpaqueToken,
} from "./token-utils";
import {
  createLeagueInviteDelivery,
  type LeagueInviteDelivery,
} from "./LeagueInviteDelivery";
import {
  createLeagueInviteRepository,
  type LeagueInviteRecord,
} from "./LeagueInviteRepository";
import { toCanonicalLeagueRole } from "@/lib/role-model";

type LeagueInviteDbClient = PrismaClient | Prisma.TransactionClient;

type MinimalUserRecord = {
  id: string;
  email: string;
  name: string | null;
};

type CreateLeagueInviteInput = {
  leagueId: string;
  email: string;
  intendedRole: "COMMISSIONER" | "MEMBER";
  teamId?: string | null;
  ownerId?: string | null;
  invitedByUserId?: string | null;
  origin: string;
  deliveryKind?: "initial" | "resend";
};

type AcceptLeagueInviteInput = {
  token: string;
  userId: string;
};

type RevokeLeagueInviteInput = {
  inviteId: string;
};

type ResendLeagueInviteInput = {
  inviteId: string;
  origin: string;
  invitedByUserId?: string | null;
};

export type LeagueInviteLandingState =
  | {
      status: "invalid";
      invite: null;
    }
  | {
      status: "expired" | "revoked" | "accepted" | "pending";
      invite: LeagueInviteRecord;
    };

export type CreateLeagueInviteResult = {
  invite: LeagueInviteRecord;
  inviteUrl: string;
  delivery: EmailDeliveryResult;
  deliveryView: ManagedLeagueInviteDelivery;
};

export type LeagueInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type ManagedLeagueInviteDelivery = {
  state: "sent" | "captured" | "logged" | "failed" | "not_configured" | "unknown";
  label: string;
  detail: string;
  attemptedAt: Date | null;
  canRetry: boolean;
  inviteStillValid: boolean;
};

export type ManagedLeagueInvite = {
  id: string;
  leagueId: string;
  email: string;
  intendedRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  ownerId: string | null;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  league: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    name: string;
  } | null;
  owner: {
    id: string;
    name: string;
    email: string | null;
    userId: string | null;
  } | null;
  invitedByUser: {
    id: string;
    email: string;
    name: string | null;
  } | null;
  delivery: ManagedLeagueInviteDelivery | null;
  status: LeagueInviteStatus;
  canResend: boolean;
  canRevoke: boolean;
};

export type AcceptLeagueInviteResult = {
  invite: LeagueInviteRecord;
  user: MinimalUserRecord;
  membership: {
    id: string;
    leagueRole: "COMMISSIONER" | "MEMBER";
    leagueId: string;
    teamId: string | null;
  };
  teamMembership: {
    id: string;
    teamId: string;
    userId: string;
    membershipType: TeamMembershipType;
    isActive: boolean;
  } | null;
  owner: {
    id: string;
    name: string;
    email: string | null;
    userId: string | null;
  } | null;
};

export type LeagueInviteServiceOptions = {
  now?: () => Date;
  tokenFactory?: () => string;
  inviteTtlMs?: number;
  delivery?: LeagueInviteDelivery;
};

type LeagueInviteAcceptanceErrorCode =
  | "INVALID_INVITE"
  | "EXPIRED_INVITE"
  | "REVOKED_INVITE"
  | "INVITE_ALREADY_ACCEPTED"
  | "INVITE_EMAIL_MISMATCH"
  | "LEAGUE_MEMBERSHIP_CONFLICT"
  | "TEAM_MEMBERSHIP_CONFLICT"
  | "OWNER_BINDING_CONFLICT";

export class LeagueInviteAcceptanceError extends Error {
  code: LeagueInviteAcceptanceErrorCode;

  constructor(code: LeagueInviteAcceptanceErrorCode) {
    super(code);
    this.name = "LeagueInviteAcceptanceError";
    this.code = code;
  }
}

type LeagueInviteManagementErrorCode =
  | "INVITE_NOT_FOUND"
  | "INVITE_ALREADY_ACCEPTED"
  | "INVITE_REVOKED"
  | "INVITE_REVOKE_NOT_ALLOWED";

export class LeagueInviteManagementError extends Error {
  code: LeagueInviteManagementErrorCode;

  constructor(code: LeagueInviteManagementErrorCode) {
    super(code);
    this.name = "LeagueInviteManagementError";
    this.code = code;
  }
}

function supportsTransactionClient(value: LeagueInviteDbClient): value is PrismaClient {
  return "$transaction" in value;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function toStoredInviteDeliveryState(
  state: ReturnType<typeof normalizeEmailDeliveryResult>["state"],
): InviteDeliveryState {
  switch (state) {
    case "captured":
      return InviteDeliveryState.CAPTURED;
    case "logged":
      return InviteDeliveryState.LOGGED;
    case "failed":
      return InviteDeliveryState.FAILED;
    case "not_configured":
      return InviteDeliveryState.NOT_CONFIGURED;
    case "sent":
    default:
      return InviteDeliveryState.SENT;
  }
}

function toPublicInviteDeliveryState(
  state: InviteDeliveryState | null,
): ManagedLeagueInviteDelivery["state"] {
  switch (state) {
    case InviteDeliveryState.CAPTURED:
      return "captured";
    case InviteDeliveryState.LOGGED:
      return "logged";
    case InviteDeliveryState.FAILED:
      return "failed";
    case InviteDeliveryState.NOT_CONFIGURED:
      return "not_configured";
    case InviteDeliveryState.SENT:
      return "sent";
    default:
      return "unknown";
  }
}

function isInviteStillValid(status: LeagueInviteStatus) {
  return status === "pending";
}

function buildManagedInviteDelivery(input: {
  invite: Pick<
    LeagueInviteRecord,
    "lastDeliveryAttemptedAt" | "lastDeliveryState" | "lastDeliveryErrorCode"
  >;
  status: LeagueInviteStatus;
  canRetry: boolean;
}): ManagedLeagueInviteDelivery | null {
  if (!input.invite.lastDeliveryState && !input.invite.lastDeliveryAttemptedAt) {
    return null;
  }

  const state = toPublicInviteDeliveryState(input.invite.lastDeliveryState);
  const inviteStillValid = isInviteStillValid(input.status);

  switch (state) {
    case "sent":
      return {
        state,
        label: "Sent",
        detail:
          input.status === "accepted"
            ? "Email was sent before this invite was accepted."
            : input.status === "expired"
              ? "Email was sent, but this invite has expired. Resend to issue a fresh link."
              : input.status === "revoked"
                ? "Email was sent before this invite was revoked."
                : "Email sent successfully. The invite is still waiting for acceptance.",
        attemptedAt: input.invite.lastDeliveryAttemptedAt,
        canRetry: input.canRetry,
        inviteStillValid,
      };
    case "captured":
      return {
        state,
        label: "Test capture active",
        detail:
          input.status === "expired"
            ? "Test capture was active when this invite was issued. No real email was sent, and the invite is now expired."
            : input.status === "accepted"
              ? "Test capture was active when this invite was issued. No real email was sent before the invite was accepted."
              : input.status === "revoked"
                ? "Test capture was active when this invite was issued. No real email was sent before this invite was revoked."
                : "Test capture is active in this environment. No real email was sent.",
        attemptedAt: input.invite.lastDeliveryAttemptedAt,
        canRetry: input.canRetry,
        inviteStillValid,
      };
    case "logged":
      return {
        state,
        label: "Local log only",
        detail:
          input.status === "expired"
            ? "This environment logged the invite email to the local server console instead of sending it, and the invite is now expired."
            : input.status === "accepted"
              ? "This environment logged the invite email to the local server console instead of sending it."
              : input.status === "revoked"
                ? "This environment logged the invite email to the local server console instead of sending it before this invite was revoked."
                : "This environment logged the invite email to the local server console instead of sending it.",
        attemptedAt: input.invite.lastDeliveryAttemptedAt,
        canRetry: input.canRetry,
        inviteStillValid,
      };
    case "not_configured":
      return {
        state,
        label: "Delivery unavailable",
        detail:
          input.status === "expired"
            ? "Email delivery was not configured when this invite was issued, and the invite is now expired. Resend after delivery is fixed."
            : input.status === "accepted"
              ? "Email delivery was not configured when this invite was issued."
              : input.status === "revoked"
                ? "Email delivery was not configured when this invite was issued before this invite was revoked."
                : "Email delivery is not configured in this environment. The invite is still valid and can be resent after delivery is fixed.",
        attemptedAt: input.invite.lastDeliveryAttemptedAt,
        canRetry: input.canRetry,
        inviteStillValid,
      };
    case "failed":
      return {
        state,
        label: "Delivery failed",
        detail:
          input.status === "expired"
            ? "The last delivery attempt failed and this invite is now expired. Resend to issue a fresh link."
            : input.status === "accepted"
              ? "The last recorded delivery attempt failed before this invite was accepted."
              : input.status === "revoked"
                ? "The last recorded delivery attempt failed before this invite was revoked."
                : "Email delivery failed, but the invite is still valid. You can resend this invite safely.",
        attemptedAt: input.invite.lastDeliveryAttemptedAt,
        canRetry: input.canRetry,
        inviteStillValid,
      };
    case "unknown":
    default:
      return {
        state: "unknown",
        label: "Delivery unknown",
        detail: "No delivery record is available for this invite yet.",
        attemptedAt: input.invite.lastDeliveryAttemptedAt,
        canRetry: input.canRetry,
        inviteStillValid,
      };
  }
}

export function deriveLeagueInviteStatus(
  invite: Pick<LeagueInviteRecord, "acceptedAt" | "revokedAt" | "expiresAt">,
  currentTime: Date,
): LeagueInviteStatus {
  if (invite.acceptedAt) {
    return "accepted";
  }

  if (invite.revokedAt) {
    return "revoked";
  }

  if (invite.expiresAt.getTime() <= currentTime.getTime()) {
    return "expired";
  }

  return "pending";
}

function buildInviteUrl(input: {
  origin: string;
  token: string;
}) {
  return new URL(
    buildInvitePath({
      token: input.token,
    }),
    input.origin,
  ).toString();
}

async function findUserByEmail(
  client: LeagueInviteDbClient,
  email: string,
): Promise<MinimalUserRecord | null> {
  return client.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

function resolveLandingState(
  invite: LeagueInviteRecord | null,
  currentTime: Date,
): LeagueInviteLandingState {
  if (!invite) {
    return {
      status: "invalid",
      invite: null,
    };
  }

  return {
    status: deriveLeagueInviteStatus(invite, currentTime),
    invite,
  };
}

async function loadInviteFromToken(
  repository: ReturnType<typeof createLeagueInviteRepository>,
  token: string,
) {
  const parsedToken = parseOpaqueToken(token);
  if (!parsedToken) {
    return null;
  }

  const invite = await repository.findById(parsedToken.recordId);
  if (!invite) {
    return null;
  }

  const tokenHash = hashOpaqueTokenSecret(parsedToken.secret);
  if (!opaqueTokenHashesEqual(invite.tokenHash, tokenHash)) {
    return null;
  }

  return invite;
}

export function createLeagueInviteService(
  client: LeagueInviteDbClient = prisma,
  options: LeagueInviteServiceOptions = {},
) {
  const repository = createLeagueInviteRepository(client);
  const delivery = options.delivery ?? createLeagueInviteDelivery();
  const now = options.now ?? (() => new Date());
  const tokenFactory = options.tokenFactory ?? (() => randomBytes(32).toString("base64url"));
  const inviteTtlMs =
    options.inviteTtlMs ?? AUTH_INVITE_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000;

  function toManagedInvite(invite: LeagueInviteRecord, currentTime: Date): ManagedLeagueInvite {
    const status = deriveLeagueInviteStatus(invite, currentTime);
    const canResend = status === "pending" || status === "expired";
    return {
      id: invite.id,
      leagueId: invite.leagueId,
      email: invite.email,
      intendedRole: toCanonicalLeagueRole(invite.intendedRole),
      teamId: invite.teamId ?? null,
      ownerId: invite.ownerId ?? null,
      createdAt: invite.createdAt,
      expiresAt: invite.expiresAt,
      acceptedAt: invite.acceptedAt,
      revokedAt: invite.revokedAt,
      league: invite.league,
      team: invite.team,
      owner: invite.owner,
      invitedByUser: invite.invitedByUser,
      delivery: buildManagedInviteDelivery({
        invite,
        status,
        canRetry: canResend,
      }),
      status,
      canResend,
      canRevoke: status === "pending",
    };
  }

  function toInviteManagementError(
    invite: LeagueInviteRecord | null,
    currentTime: Date,
    fallback: LeagueInviteManagementErrorCode = "INVITE_NOT_FOUND",
  ) {
    if (!invite) {
      return new LeagueInviteManagementError(fallback);
    }

    const status = deriveLeagueInviteStatus(invite, currentTime);
    if (status === "accepted") {
      return new LeagueInviteManagementError("INVITE_ALREADY_ACCEPTED");
    }
    if (status === "revoked") {
      return new LeagueInviteManagementError("INVITE_REVOKED");
    }

    return new LeagueInviteManagementError("INVITE_REVOKE_NOT_ALLOWED");
  }

  async function createInvite(input: CreateLeagueInviteInput): Promise<CreateLeagueInviteResult> {
    const email = normalizeEmail(input.email);
    const currentTime = now();
    const secret = tokenFactory().trim();
    if (secret.length === 0) {
      throw new Error("Invite token secret must not be empty.");
    }

    const expiresAt = new Date(currentTime.getTime() + inviteTtlMs);
    const invite = await repository.create({
      leagueId: input.leagueId,
      email,
      intendedRole: toCanonicalLeagueRole(input.intendedRole),
      teamId: input.teamId ?? null,
      ownerId: input.ownerId ?? null,
      tokenHash: hashOpaqueTokenSecret(secret),
      expiresAt,
      invitedByUserId: input.invitedByUserId ?? null,
    });

    const inviteUrl = buildInviteUrl({
      origin: resolveEmailAppOrigin(input.origin),
      token: buildOpaqueToken(invite.id, secret),
    });

    const deliveryResult = await delivery.send({
      email,
      inviteUrl,
      leagueId: invite.league.id,
      leagueName: invite.league.name,
      teamName: invite.team?.name ?? null,
      intendedRole: toCanonicalLeagueRole(invite.intendedRole),
      invitedByName: invite.invitedByUser?.name ?? null,
      invitedByEmail: invite.invitedByUser?.email ?? null,
      expiresAt,
      deliveryKind: input.deliveryKind ?? "initial",
    });

    const normalizedDelivery = normalizeEmailDeliveryResult(deliveryResult);
    const deliveryAttemptedAt = now();
    const inviteWithDelivery = await repository.recordDeliveryAttempt({
      id: invite.id,
      attemptedAt: deliveryAttemptedAt,
      state: toStoredInviteDeliveryState(normalizedDelivery.state),
      errorCode: normalizedDelivery.errorCode,
    });
    const deliveryView = buildManagedInviteDelivery({
      invite: inviteWithDelivery,
      status: "pending",
      canRetry: true,
    });

    logRuntime(deliveryResult.ok ? "info" : "warn", {
      event: "auth.invite.delivery_recorded",
      inviteId: invite.id,
      leagueId: invite.leagueId,
      recipient: maskEmailAddress(email),
      deliveryKind: input.deliveryKind ?? "initial",
      deliveryState: normalizedDelivery.state,
      deliveryErrorCode: normalizedDelivery.errorCode,
    });

    return {
      invite: inviteWithDelivery,
      inviteUrl,
      delivery: deliveryResult,
      deliveryView:
        deliveryView ??
        buildManagedInviteDelivery({
          invite: {
            lastDeliveryAttemptedAt: deliveryAttemptedAt,
            lastDeliveryState: toStoredInviteDeliveryState(normalizedDelivery.state),
            lastDeliveryErrorCode: normalizedDelivery.errorCode,
          } as Pick<
            LeagueInviteRecord,
            "lastDeliveryAttemptedAt" | "lastDeliveryState" | "lastDeliveryErrorCode"
          >,
          status: "pending",
          canRetry: true,
        })!,
    };
  }

  async function getInviteLandingState(token: string): Promise<LeagueInviteLandingState> {
    const invite = await loadInviteFromToken(repository, token);
    return resolveLandingState(invite, now());
  }

  async function findLatestPendingInviteByEmail(email: string) {
    return repository.findLatestPendingByEmail(normalizeEmail(email), now());
  }

  async function listInvitesForLeague(leagueId: string): Promise<ManagedLeagueInvite[]> {
    const currentTime = now();
    const invites = await repository.listByLeagueId(leagueId);
    return invites.map((invite) => toManagedInvite(invite, currentTime));
  }

  async function findOrCreateUserForInvitedEmail(email: string): Promise<MinimalUserRecord | null> {
    const normalizedEmail = normalizeEmail(email);
    const existingUser = await findUserByEmail(client, normalizedEmail);
    if (existingUser) {
      return existingUser;
    }

    const invite = await repository.findLatestPendingByEmail(normalizedEmail, now());
    if (!invite) {
      return null;
    }

    return client.user.upsert({
      where: {
        email: normalizedEmail,
      },
      update: {},
      create: {
        email: normalizedEmail,
        name: invite.owner?.name ?? null,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });
  }

  async function acceptInviteForAuthenticatedUser(
    input: AcceptLeagueInviteInput,
  ): Promise<AcceptLeagueInviteResult> {
    const execute = async (transactionClient: LeagueInviteDbClient) => {
      const transactionRepository = createLeagueInviteRepository(transactionClient);
      const teamMembershipRepository = createTeamMembershipRepository(transactionClient);
      const currentTime = now();

      const invite = await loadInviteFromToken(transactionRepository, input.token);
      const landingState = resolveLandingState(invite, currentTime);
      if (landingState.status === "invalid") {
        throw new LeagueInviteAcceptanceError("INVALID_INVITE");
      }
      if (landingState.status === "expired") {
        throw new LeagueInviteAcceptanceError("EXPIRED_INVITE");
      }
      if (landingState.status === "revoked") {
        throw new LeagueInviteAcceptanceError("REVOKED_INVITE");
      }
      if (landingState.status === "accepted") {
        throw new LeagueInviteAcceptanceError("INVITE_ALREADY_ACCEPTED");
      }

      const pendingInvite = landingState.invite;
      const user = await transactionClient.user.findUnique({
        where: {
          id: input.userId,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      if (!user || normalizeEmail(user.email) !== pendingInvite.email) {
        throw new LeagueInviteAcceptanceError("INVITE_EMAIL_MISMATCH");
      }

      const existingMembership = await transactionClient.leagueMembership.findUnique({
        where: {
          userId_leagueId: {
            userId: user.id,
            leagueId: pendingInvite.leagueId,
          },
        },
        select: {
          id: true,
          role: true,
          teamId: true,
        },
      });

      const expectedTeamId = pendingInvite.teamId ?? null;
      const expectedLeagueRole =
        pendingInvite.intendedRole === "COMMISSIONER"
          ? LeagueRole.COMMISSIONER
          : LeagueRole.MEMBER;
      const isCommissionerInvite = expectedLeagueRole === LeagueRole.COMMISSIONER;
      const membershipRoleForUpsert = isCommissionerInvite
        ? LeagueRole.MEMBER
        : expectedLeagueRole;
      const resolvedMembershipTeamId = isCommissionerInvite
        ? expectedTeamId ?? existingMembership?.teamId ?? null
        : expectedTeamId;
      if (
        existingMembership &&
        !isCommissionerInvite &&
        (toCanonicalLeagueRole(existingMembership.role) !== expectedLeagueRole ||
          (existingMembership.teamId ?? null) !== resolvedMembershipTeamId)
      ) {
        throw new LeagueInviteAcceptanceError("LEAGUE_MEMBERSHIP_CONFLICT");
      }

      if (pendingInvite.teamId && expectedLeagueRole === LeagueRole.MEMBER) {
        const conflictingMembership = await transactionClient.leagueMembership.findFirst({
          where: {
            leagueId: pendingInvite.leagueId,
            teamId: pendingInvite.teamId,
            role: expectedLeagueRole,
            userId: {
              not: user.id,
            },
          },
          select: {
            id: true,
          },
        });
        if (conflictingMembership) {
          throw new LeagueInviteAcceptanceError("TEAM_MEMBERSHIP_CONFLICT");
        }

        const conflictingTeamMembership = await transactionClient.teamMembership.findFirst({
          where: {
            teamId: pendingInvite.teamId,
            isActive: true,
            membershipType: TeamMembershipType.PRIMARY_MANAGER,
            userId: {
              not: user.id,
            },
          },
          select: {
            id: true,
          },
        });
        if (conflictingTeamMembership) {
          throw new LeagueInviteAcceptanceError("TEAM_MEMBERSHIP_CONFLICT");
        }
      }

      let ownerRecord: AcceptLeagueInviteResult["owner"] = null;
      if (pendingInvite.ownerId) {
        const existingOwner = await transactionClient.owner.findUnique({
          where: {
            id: pendingInvite.ownerId,
          },
          select: {
            id: true,
            name: true,
            email: true,
            userId: true,
          },
        });

        if (!existingOwner || (existingOwner.userId && existingOwner.userId !== user.id)) {
          throw new LeagueInviteAcceptanceError("OWNER_BINDING_CONFLICT");
        }

        ownerRecord = await transactionClient.owner.update({
          where: {
            id: pendingInvite.ownerId,
          },
          data: {
            email: pendingInvite.email,
            userId: user.id,
          },
          select: {
            id: true,
            name: true,
            email: true,
            userId: true,
          },
        });
      }

      if (!user.name && ownerRecord?.name) {
        await transactionClient.user.update({
          where: {
            id: user.id,
          },
          data: {
            name: ownerRecord.name,
          },
        });
      }

      const didAccept = await transactionRepository.acceptIfAvailable(
        pendingInvite.id,
        currentTime,
        currentTime,
      );
      if (!didAccept) {
        throw new LeagueInviteAcceptanceError("INVITE_ALREADY_ACCEPTED");
      }

      let membership = existingMembership
        ? await transactionClient.leagueMembership.update({
            where: {
              id: existingMembership.id,
            },
            data: {
              role: membershipRoleForUpsert,
              teamId: resolvedMembershipTeamId,
            },
            select: {
              id: true,
              role: true,
              leagueId: true,
              teamId: true,
            },
          })
        : await transactionClient.leagueMembership.create({
            data: {
              userId: user.id,
              leagueId: pendingInvite.leagueId,
              role: membershipRoleForUpsert,
              teamId: resolvedMembershipTeamId,
            },
            select: {
              id: true,
              role: true,
              leagueId: true,
              teamId: true,
            },
          });

      if (isCommissionerInvite) {
        const promotedMembership = await promoteLeagueMemberToCommissioner(transactionClient, {
          leagueId: pendingInvite.leagueId,
          userId: user.id,
        });
        membership = {
          id: promotedMembership.id,
          role: promotedMembership.role,
          leagueId: promotedMembership.leagueId,
          teamId: promotedMembership.teamId,
        };
      }

      if (pendingInvite.teamId && pendingInvite.ownerId) {
        await transactionClient.team.update({
          where: {
            id: pendingInvite.teamId,
          },
          data: {
            ownerId: pendingInvite.ownerId,
          },
        });
      }

      const teamMembership =
        pendingInvite.teamId && expectedLeagueRole === "MEMBER"
          ? await teamMembershipRepository.upsertMembership({
              teamId: pendingInvite.teamId,
              userId: user.id,
              membershipType: TeamMembershipType.PRIMARY_MANAGER,
              isActive: true,
            })
          : null;

      const acceptedInvite = await transactionRepository.findById(pendingInvite.id);
      if (!acceptedInvite) {
        throw new LeagueInviteAcceptanceError("INVALID_INVITE");
      }

      return {
        invite: acceptedInvite,
        user: {
          id: user.id,
          email: user.email,
          name: user.name ?? ownerRecord?.name ?? null,
        },
        membership: {
          id: membership.id,
          leagueRole: toCanonicalLeagueRole(membership.role),
          leagueId: membership.leagueId,
          teamId: membership.teamId,
        },
        teamMembership,
        owner: ownerRecord,
      };
    };

    if (supportsTransactionClient(client)) {
      return client.$transaction((transactionClient) => execute(transactionClient));
    }

    return execute(client);
  }

  async function revokeInvite(input: RevokeLeagueInviteInput) {
    const execute = async (transactionClient: LeagueInviteDbClient) => {
      const transactionRepository = createLeagueInviteRepository(transactionClient);
      const currentTime = now();
      const invite = await transactionRepository.findById(input.inviteId);
      if (!invite) {
        throw new LeagueInviteManagementError("INVITE_NOT_FOUND");
      }

      const status = deriveLeagueInviteStatus(invite, currentTime);
      if (status !== "pending") {
        throw toInviteManagementError(invite, currentTime);
      }

      const didRevoke = await transactionRepository.revokeIfAvailable(
        input.inviteId,
        currentTime,
        currentTime,
      );
      if (!didRevoke) {
        const latestInvite = await transactionRepository.findById(input.inviteId);
        throw toInviteManagementError(latestInvite, currentTime);
      }

      const revokedInvite = await transactionRepository.findById(input.inviteId);
      if (!revokedInvite) {
        throw new LeagueInviteManagementError("INVITE_NOT_FOUND");
      }

      return toManagedInvite(revokedInvite, currentTime);
    };

    if (supportsTransactionClient(client)) {
      return client.$transaction((transactionClient) => execute(transactionClient));
    }

    return execute(client);
  }

  async function resendInvite(input: ResendLeagueInviteInput): Promise<CreateLeagueInviteResult> {
    const execute = async (transactionClient: LeagueInviteDbClient) => {
      const transactionRepository = createLeagueInviteRepository(transactionClient);
      const currentTime = now();
      const invite = await transactionRepository.findById(input.inviteId);
      if (!invite) {
        throw new LeagueInviteManagementError("INVITE_NOT_FOUND");
      }

      const status = deriveLeagueInviteStatus(invite, currentTime);
      if (status === "accepted") {
        throw new LeagueInviteManagementError("INVITE_ALREADY_ACCEPTED");
      }
      if (status === "revoked") {
        throw new LeagueInviteManagementError("INVITE_REVOKED");
      }

      if (status === "pending") {
        const didRevoke = await transactionRepository.revokeIfAvailable(
          invite.id,
          currentTime,
          currentTime,
        );
        if (!didRevoke) {
          const latestInvite = await transactionRepository.findById(invite.id);
          throw toInviteManagementError(latestInvite, currentTime);
        }
      }

      await transactionRepository.revokePendingByLeagueAndEmail(
        invite.leagueId,
        invite.email,
        currentTime,
        currentTime,
        invite.id,
      );

      return createLeagueInviteService(transactionClient, {
        now,
        tokenFactory,
        inviteTtlMs,
        delivery,
      }).createInvite({
        leagueId: invite.leagueId,
        email: invite.email,
        intendedRole:
          toCanonicalLeagueRole(invite.intendedRole) === "COMMISSIONER"
            ? "COMMISSIONER"
            : "MEMBER",
        teamId: invite.teamId ?? null,
        ownerId: invite.ownerId ?? null,
        invitedByUserId: input.invitedByUserId ?? invite.invitedByUserId ?? null,
        origin: input.origin,
        deliveryKind: "resend",
      });
    };

    if (supportsTransactionClient(client)) {
      return client.$transaction((transactionClient) => execute(transactionClient));
    }

    return execute(client);
  }

  return {
    createInvite,
    getInviteLandingState,
    findLatestPendingInviteByEmail,
    listInvitesForLeague,
    findOrCreateUserForInvitedEmail,
    acceptInviteForAuthenticatedUser,
    revokeInvite,
    resendInvite,
  };
}

export function readInviteTokenFromSearchParams(searchParams: URLSearchParams) {
  return searchParams.get(AUTH_INVITE_TOKEN_PARAM)?.trim() ?? "";
}
