import {
  createEmailDeliveryService,
  finalizeEmailDeliveryAttempts,
  maskEmailAddress,
  type EmailDeliveryResult,
} from "@/lib/email/EmailDeliveryService";
import { renderMagicLinkEmailTemplate } from "@/lib/email/templates";
import {
  isMagicLinkConsoleLoggingEnabled,
  isMagicLinkTestCaptureEnabled,
} from "@/lib/auth-constants";
import { normalizeReturnTo } from "@/lib/return-to";
import { logRuntime } from "@/lib/runtime-log";

export type SendMagicLinkInput = {
  email: string;
  magicLinkUrl: string;
  expiresAt: Date;
};

export type CapturedMagicLinkDelivery = SendMagicLinkInput & {
  subject: string;
  html: string;
  text: string;
  createdAt: Date;
};

export type MagicLinkDelivery = {
  send(input: SendMagicLinkInput): Promise<EmailDeliveryResult>;
};

const MAGIC_LINK_OUTBOX_KEY = Symbol.for("dynasty.auth.magic-link-outbox");

type MagicLinkCaptureHost = typeof globalThis & {
  [MAGIC_LINK_OUTBOX_KEY]?: CapturedMagicLinkDelivery[];
};

function getCapturedOutbox() {
  const host = globalThis as MagicLinkCaptureHost;
  host[MAGIC_LINK_OUTBOX_KEY] ??= [];
  return host[MAGIC_LINK_OUTBOX_KEY];
}

export function captureMagicLinkDelivery(input: CapturedMagicLinkDelivery) {
  getCapturedOutbox().push(input);
}

export function findLatestCapturedMagicLink(
  email: string,
  options: {
    returnTo?: string | null;
  } = {},
) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedReturnTo = normalizeReturnTo(options.returnTo ?? null);
  const entries = getCapturedOutbox().filter((entry) => {
    if (entry.email !== normalizedEmail) {
      return false;
    }

    if (!normalizedReturnTo) {
      return true;
    }

    return new URL(entry.magicLinkUrl).searchParams.get("returnTo") === normalizedReturnTo;
  });
  return entries[entries.length - 1] ?? null;
}

export function clearCapturedMagicLinks() {
  getCapturedOutbox().splice(0, getCapturedOutbox().length);
}

export function createMagicLinkDelivery(): MagicLinkDelivery {
  const captureEnabled = isMagicLinkTestCaptureEnabled();
  const consoleLoggingEnabled = isMagicLinkConsoleLoggingEnabled();
  const emailDeliveryService = createEmailDeliveryService();

  return {
    async send(input) {
      const template = renderMagicLinkEmailTemplate({
        magicLinkUrl: input.magicLinkUrl,
        expiresAt: input.expiresAt,
      });
      const attempts = [];

      if (captureEnabled) {
        captureMagicLinkDelivery({
          ...input,
          subject: template.subject,
          html: template.html,
          text: template.text,
          createdAt: new Date(),
        });
        logRuntime("info", {
          event: "auth.email.capture_used",
          emailKind: "magic-link-sign-in",
          transport: "capture",
          recipient: maskEmailAddress(input.email),
        });
        attempts.push({
          channel: "capture" as const,
          status: "captured" as const,
          ok: true,
          provider: null,
          messageId: null,
          errorCode: null,
        });
      }

      const transportResult = await emailDeliveryService.send(
        {
          kind: "magic-link-sign-in",
          to: input.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          metadata: {
            expiresAt: input.expiresAt.toISOString(),
          },
        },
        {
          consoleLoggingEnabled,
          captureActive: captureEnabled,
        },
      );

      return finalizeEmailDeliveryAttempts([
        ...attempts,
        ...transportResult.attempts.filter(
          (attempt) =>
            !(
              (attempt.channel === "provider" && attempt.errorCode === "EMAIL_PROVIDER_DISABLED") ||
              (attempt.channel === "system" && attempt.errorCode === "EMAIL_DELIVERY_NOT_CONFIGURED")
            ),
        ),
      ]);
    },
  };
}
