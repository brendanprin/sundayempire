import {
  createEmailDeliveryService,
  finalizeEmailDeliveryAttempts,
  maskEmailAddress,
  type EmailDeliveryResult,
} from "@/lib/email/EmailDeliveryService";
import { renderPlatformInviteEmailTemplate } from "@/lib/email/templates";
import {
  isInviteConsoleLoggingEnabled,
  isInviteTestCaptureEnabled,
} from "@/lib/auth-constants";
import { logRuntime } from "@/lib/runtime-log";

export type SendPlatformInviteInput = {
  email: string;
  inviteUrl: string;
  invitedByName?: string | null;
  invitedByEmail?: string | null;
  expiresAt: Date;
  deliveryKind?: "initial" | "resend";
};

export type CapturedPlatformInviteDelivery = SendPlatformInviteInput & {
  subject: string;
  html: string;
  text: string;
  createdAt: Date;
};

export type PlatformInviteDelivery = {
  send(input: SendPlatformInviteInput): Promise<EmailDeliveryResult>;
};

const PLATFORM_INVITE_OUTBOX_KEY = Symbol.for("dynasty.auth.platform-invite-outbox");

type PlatformInviteCaptureHost = typeof globalThis & {
  [PLATFORM_INVITE_OUTBOX_KEY]?: CapturedPlatformInviteDelivery[];
};

function getCapturedOutbox() {
  const host = globalThis as PlatformInviteCaptureHost;
  host[PLATFORM_INVITE_OUTBOX_KEY] ??= [];
  return host[PLATFORM_INVITE_OUTBOX_KEY];
}

export function capturePlatformInviteDelivery(input: CapturedPlatformInviteDelivery) {
  getCapturedOutbox().push(input);
}

export function findLatestCapturedPlatformInvite(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const entries = getCapturedOutbox().filter((e) => e.email === normalizedEmail);
  return entries[entries.length - 1] ?? null;
}

export function clearCapturedPlatformInvites() {
  getCapturedOutbox().splice(0, getCapturedOutbox().length);
}

export function createPlatformInviteDelivery(): PlatformInviteDelivery {
  const captureEnabled = isInviteTestCaptureEnabled();
  const consoleLoggingEnabled = isInviteConsoleLoggingEnabled();
  const emailDeliveryService = createEmailDeliveryService();

  return {
    async send(input) {
      const template = renderPlatformInviteEmailTemplate({
        inviteUrl: input.inviteUrl,
        invitedByName: input.invitedByName ?? null,
        invitedByEmail: input.invitedByEmail ?? null,
        expiresAt: input.expiresAt,
        variant: input.deliveryKind ?? "initial",
      });
      const attempts = [];

      if (captureEnabled) {
        capturePlatformInviteDelivery({
          ...input,
          subject: template.subject,
          html: template.html,
          text: template.text,
          createdAt: new Date(),
        });
        logRuntime("info", {
          event: "auth.email.capture_used",
          emailKind:
            (input.deliveryKind ?? "initial") === "resend"
              ? "platform-invite-resend"
              : "platform-invite",
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
          kind:
            (input.deliveryKind ?? "initial") === "resend"
              ? "platform-invite-resend"
              : "platform-invite",
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
