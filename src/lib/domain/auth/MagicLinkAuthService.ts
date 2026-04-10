import { Prisma, PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  AUTH_MAGIC_LINK_DEFAULT_TTL_MINUTES,
  AUTH_MAGIC_LINK_PURPOSE_SIGN_IN,
  AUTH_MAGIC_LINK_TOKEN_PARAM,
  AUTH_SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth-constants";
import {
  resolveEmailAppOrigin,
  type EmailDeliveryResult,
} from "@/lib/email/EmailDeliveryService";
import { normalizeReturnTo, RETURN_TO_PARAM } from "@/lib/return-to";
import { prisma } from "@/lib/prisma";
import { createAuthSessionService, type AuthenticatedSession } from "./AuthSessionService";
import { createLeagueInviteService } from "./LeagueInviteService";
import { createPlatformInviteRepository } from "./PlatformInviteRepository";
import { createMagicLinkDelivery, type MagicLinkDelivery } from "./MagicLinkDelivery";
import { createMagicLinkRepository, type AuthMagicLinkRecord } from "./MagicLinkRepository";
import {
  buildOpaqueToken,
  hashOpaqueTokenSecret,
  opaqueTokenHashesEqual,
  parseOpaqueToken,
} from "./token-utils";

type MagicLinkDbClient = PrismaClient | Prisma.TransactionClient;

type MinimalUserRecord = {
  id: string;
  email: string;
  name: string | null;
};

type RequestMagicLinkInput = {
  email: string;
  origin: string;
  returnTo?: string | null;
  requestedByIp?: string | null;
  requestedByUserAgent?: string | null;
};

type ConsumeMagicLinkInput = {
  token: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type RequestMagicLinkResult = {
  accepted: true;
  created: boolean;
  throttled: boolean;
  email: string;
  expiresAt: Date | null;
  delivery: EmailDeliveryResult | null;
};

export type ConsumedMagicLinkResult = {
  magicLink: AuthMagicLinkRecord;
  session: AuthenticatedSession;
  sessionToken: string;
  user: MinimalUserRecord;
};

export type MagicLinkAuthServiceOptions = {
  now?: () => Date;
  tokenFactory?: () => string;
  sessionTokenFactory?: () => string;
  magicLinkTtlMs?: number;
  requestThrottleMs?: number;
  sessionMaxAgeSeconds?: number;
  delivery?: MagicLinkDelivery;
};

type MagicLinkConsumeErrorCode =
  | "INVALID_MAGIC_LINK"
  | "EXPIRED_MAGIC_LINK"
  | "CONSUMED_MAGIC_LINK"
  | "MAGIC_LINK_USER_NOT_FOUND";

export class MagicLinkConsumeError extends Error {
  code: MagicLinkConsumeErrorCode;

  constructor(code: MagicLinkConsumeErrorCode) {
    super(code);
    this.name = "MagicLinkConsumeError";
    this.code = code;
  }
}

function supportsTransactionClient(value: MagicLinkDbClient): value is PrismaClient {
  return "$transaction" in value;
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function buildMagicLinkUrl(input: {
  origin: string;
  token: string;
  returnTo?: string | null;
}) {
  const url = new URL("/api/auth/session", input.origin);
  url.searchParams.set(AUTH_MAGIC_LINK_TOKEN_PARAM, input.token);

  const returnTo = normalizeReturnTo(input.returnTo ?? null);
  if (returnTo) {
    url.searchParams.set(RETURN_TO_PARAM, returnTo);
  }

  return url.toString();
}

async function findUserByEmail(client: MagicLinkDbClient, email: string): Promise<MinimalUserRecord | null> {
  return client.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });
}

export function createMagicLinkAuthService(
  client: MagicLinkDbClient = prisma,
  options: MagicLinkAuthServiceOptions = {},
) {
  const magicLinkRepository = createMagicLinkRepository(client);
  const leagueInviteService = createLeagueInviteService(client, {
    now: options.now,
  });
  const delivery = options.delivery ?? createMagicLinkDelivery();
  const now = options.now ?? (() => new Date());
  const tokenFactory = options.tokenFactory ?? (() => randomBytes(32).toString("base64url"));
  const magicLinkTtlMs =
    options.magicLinkTtlMs ?? AUTH_MAGIC_LINK_DEFAULT_TTL_MINUTES * 60 * 1000;
  const requestThrottleMs = options.requestThrottleMs ?? 0;
  const sessionMaxAgeSeconds = options.sessionMaxAgeSeconds ?? AUTH_SESSION_MAX_AGE_SECONDS;

  async function requestMagicLink(input: RequestMagicLinkInput): Promise<RequestMagicLinkResult> {
    const email = normalizeEmail(input.email);
    const currentTime = now();
    const user = await findUserByEmail(client, email);

    if (!user) {
      // Only create a magic link if the email has a pending invite of some kind.
      const platformInviteRepo = createPlatformInviteRepository(client);
      const hasPlatformInvite = Boolean(
        await platformInviteRepo.findLatestPendingByEmail(email, currentTime),
      );
      const hasLeagueInvite = hasPlatformInvite
        ? false
        : Boolean(await leagueInviteService.findLatestPendingInviteByEmail(email));

      if (!hasPlatformInvite && !hasLeagueInvite) {
        return {
          accepted: true,
          created: false,
          throttled: false,
          email,
          expiresAt: null,
          delivery: null,
        };
      }
    }

    const existingLink = await magicLinkRepository.findLatestActiveByEmail(email, currentTime);
    if (
      requestThrottleMs > 0 &&
      existingLink &&
      currentTime.getTime() - existingLink.createdAt.getTime() < requestThrottleMs
    ) {
      return {
        accepted: true,
        created: false,
        throttled: true,
        email,
        expiresAt: existingLink.expiresAt,
        delivery: null,
      };
    }

    const secret = tokenFactory().trim();
    if (secret.length === 0) {
      throw new Error("Magic link token secret must not be empty.");
    }

    const expiresAt = new Date(currentTime.getTime() + magicLinkTtlMs);
    const record = await magicLinkRepository.create({
      email,
      tokenHash: hashOpaqueTokenSecret(secret),
      purpose: AUTH_MAGIC_LINK_PURPOSE_SIGN_IN,
      expiresAt,
      requestedByIp: input.requestedByIp ?? null,
      requestedByUserAgent: input.requestedByUserAgent ?? null,
    });

    const deliveryResult = await delivery.send({
      email,
      magicLinkUrl: buildMagicLinkUrl({
        origin: resolveEmailAppOrigin(input.origin),
        token: buildOpaqueToken(record.id, secret),
        returnTo: input.returnTo ?? null,
      }),
      expiresAt,
    });

    return {
      accepted: true,
      created: true,
      throttled: false,
      email,
      expiresAt,
      delivery: deliveryResult,
    };
  }

  async function consumeMagicLink(input: ConsumeMagicLinkInput): Promise<ConsumedMagicLinkResult> {
    const parsedToken = parseOpaqueToken(input.token);
    if (!parsedToken) {
      throw new MagicLinkConsumeError("INVALID_MAGIC_LINK");
    }

    const currentTime = now();

    const consumeWithClient = async (transactionClient: MagicLinkDbClient) => {
      const repository = createMagicLinkRepository(transactionClient);
      const record = await repository.findById(parsedToken.recordId);
      if (!record) {
        throw new MagicLinkConsumeError("INVALID_MAGIC_LINK");
      }

      if (record.consumedAt) {
        throw new MagicLinkConsumeError("CONSUMED_MAGIC_LINK");
      }

      if (record.expiresAt.getTime() <= currentTime.getTime()) {
        throw new MagicLinkConsumeError("EXPIRED_MAGIC_LINK");
      }

      const tokenHash = hashOpaqueTokenSecret(parsedToken.secret);
      if (!opaqueTokenHashesEqual(record.tokenHash, tokenHash)) {
        throw new MagicLinkConsumeError("INVALID_MAGIC_LINK");
      }

      const existingUser = await findUserByEmail(transactionClient, record.email);
      const user = existingUser ?? await (async () => {
        // Platform invite takes priority — it directly grants platform access.
        const platformInviteRepo = createPlatformInviteRepository(transactionClient);
        const pendingPlatformInvite = await platformInviteRepo.findLatestPendingByEmail(
          record.email,
          currentTime,
        );
        if (pendingPlatformInvite) {
          return transactionClient.user.create({
            data: { email: record.email, name: null },
            select: { id: true, email: true, name: true },
          });
        }

        // Fall back to league invite (existing behaviour).
        return createLeagueInviteService(transactionClient, { now }).findOrCreateUserForInvitedEmail(
          record.email,
        );
      })();

      if (!user) {
        throw new MagicLinkConsumeError("MAGIC_LINK_USER_NOT_FOUND");
      }

      const didConsume = await repository.consumeIfAvailable(record.id, currentTime);
      if (!didConsume) {
        throw new MagicLinkConsumeError("CONSUMED_MAGIC_LINK");
      }

      const sessionService = createAuthSessionService(transactionClient, {
        allowLegacyIdentity: false,
        now,
        tokenFactory: options.sessionTokenFactory,
      });
      const { session, token } = await sessionService.createSession({
        userId: user.id,
        expiresAt: new Date(currentTime.getTime() + sessionMaxAgeSeconds * 1000),
        userAgent: input.userAgent ?? null,
        ipAddress: input.ipAddress ?? null,
      });

      return {
        magicLink: record,
        session,
        sessionToken: token,
        user,
      };
    };

    if (supportsTransactionClient(client)) {
      return client.$transaction((transactionClient) => consumeWithClient(transactionClient));
    }

    return consumeWithClient(client);
  }

  return {
    requestMagicLink,
    consumeMagicLink,
  };
}
