import {
  createEmailDeliveryService,
  finalizeEmailDeliveryAttempts,
  maskEmailAddress,
  type EmailDeliveryResult,
} from "@/lib/email/EmailDeliveryService";
import { renderLeagueInviteEmailTemplate } from "@/lib/email/templates";
import {
  isInviteConsoleLoggingEnabled,
  isInviteTestCaptureEnabled,
} from "@/lib/auth-constants";
import { logRuntime } from "@/lib/runtime-log";

export type SendLeagueInviteInput = {
  email: string;
  inviteUrl: string;
  leagueId: string;
  leagueName: string;
  teamName: string | null;
  intendedRole: "COMMISSIONER" | "MEMBER";
  invitedByName?: string | null;
  invitedByEmail?: string | null;
  expiresAt: Date;
  deliveryKind?: "initial" | "resend";
};

export type CapturedLeagueInviteDelivery = SendLeagueInviteInput & {
  subject: string;
  html: string;
  text: string;
  createdAt: Date;
};

export type LeagueInviteDelivery = {
  send(input: SendLeagueInviteInput): Promise<EmailDeliveryResult>;
};

const LEAGUE_INVITE_OUTBOX_KEY = Symbol.for("dynasty.auth.league-invite-outbox");

type LeagueInviteCaptureHost = typeof globalThis & {
  [LEAGUE_INVITE_OUTBOX_KEY]?: CapturedLeagueInviteDelivery[];
};

function getCapturedOutbox() {
  const host = globalThis as LeagueInviteCaptureHost;
  host[LEAGUE_INVITE_OUTBOX_KEY] ??= [];
  return host[LEAGUE_INVITE_OUTBOX_KEY];
}

export function captureLeagueInviteDelivery(input: CapturedLeagueInviteDelivery) {
  getCapturedOutbox().push(input);
}

export function findLatestCapturedLeagueInvite(
  email: string,
  options: {
    leagueId?: string | null;
  } = {},
) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedLeagueId = options.leagueId?.trim() || null;
  const entries = getCapturedOutbox().filter((entry) => {
    if (entry.email !== normalizedEmail) {
      return false;
    }

    if (!normalizedLeagueId) {
      return true;
    }

    return entry.leagueId === normalizedLeagueId;
  });

  return entries[entries.length - 1] ?? null;
}

export function clearCapturedLeagueInvites() {
  getCapturedOutbox().splice(0, getCapturedOutbox().length);
}

export function createLeagueInviteDelivery(): LeagueInviteDelivery {
  const captureEnabled = isInviteTestCaptureEnabled();
  const consoleLoggingEnabled = isInviteConsoleLoggingEnabled();
  const emailDeliveryService = createEmailDeliveryService();

  return {
    async send(input) {
      const template = renderLeagueInviteEmailTemplate({
        inviteUrl: input.inviteUrl,
        leagueName: input.leagueName,
        intendedRole: input.intendedRole,
        teamName: input.teamName,
        invitedByName: input.invitedByName ?? null,
        invitedByEmail: input.invitedByEmail ?? null,
        expiresAt: input.expiresAt,
        variant: input.deliveryKind ?? "initial",
      });
      const attempts = [];

      if (captureEnabled) {
        captureLeagueInviteDelivery({
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
              ? "league-invite-resend"
              : "league-invite",
          transport: "capture",
          recipient: maskEmailAddress(input.email),
          leagueId: input.leagueId,
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
              ? "league-invite-resend"
              : "league-invite",
          to: input.email,
          subject: template.subject,
          html: template.html,
          text: template.text,
          metadata: {
            leagueId: input.leagueId,
            leagueName: input.leagueName,
            teamName: input.teamName,
            intendedRole: input.intendedRole,
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
