import { logRuntime } from "@/lib/runtime-log";

export type EmailTemplateKind =
  | "magic-link-sign-in"
  | "league-invite"
  | "league-invite-resend";

export type PreparedEmailMessage = {
  kind: EmailTemplateKind;
  to: string;
  subject: string;
  html: string;
  text: string;
  metadata?: Record<string, string | null | undefined>;
};

export type EmailDeliveryAttempt = {
  channel: "provider" | "capture" | "console" | "system";
  status: "sent" | "captured" | "logged" | "failed";
  ok: boolean;
  provider: "resend" | null;
  messageId: string | null;
  errorCode: string | null;
};

export type EmailDeliveryResult = {
  ok: boolean;
  summary: "sent" | "captured" | "logged" | "mixed" | "failed";
  primaryChannel: EmailDeliveryAttempt["channel"];
  errorCode: string | null;
  attempts: EmailDeliveryAttempt[];
};

export type PublicEmailDeliveryResult = Pick<
  EmailDeliveryResult,
  "ok" | "summary" | "primaryChannel" | "errorCode"
>;

export type NormalizedEmailDeliveryState =
  | "sent"
  | "captured"
  | "logged"
  | "failed"
  | "not_configured";

export type NormalizedEmailDeliveryResult = {
  state: NormalizedEmailDeliveryState;
  errorCode: string | null;
};

export type EmailDeliveryConfig = {
  providerEnabled: boolean;
  providerName: "resend" | null;
  providerApiKey: string | null;
  fromEmail: string | null;
  fromName: string;
  replyTo: string | null;
  appBaseUrl: string | null;
};

export type EmailDeliveryServiceOptions = {
  config?: EmailDeliveryConfig;
  fetchFn?: typeof fetch;
};

function trimOptional(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function isExplicitTrue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function isExplicitFalse(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized === "0" || normalized === "false";
}

export function maskEmailAddress(email: string) {
  const normalized = email.trim().toLowerCase();
  const [localPart, domain] = normalized.split("@");
  if (!localPart || !domain) {
    return "***";
  }

  const visibleLocal = localPart.slice(0, 1);
  return `${visibleLocal}***@${domain}`;
}

export function resolveEmailDeliveryConfig(
  env: NodeJS.ProcessEnv = process.env,
): EmailDeliveryConfig {
  const providerEnabledFlag = env.AUTH_EMAIL_PROVIDER_ENABLED;
  const providerEnabled =
    !isExplicitFalse(providerEnabledFlag) &&
    isExplicitTrue(providerEnabledFlag) &&
    env.NODE_ENV !== "test";

  const providerName = trimOptional(env.AUTH_EMAIL_PROVIDER)?.toLowerCase();
  const appBaseUrl = trimOptional(env.AUTH_APP_BASE_URL);

  return {
    providerEnabled,
    providerName: providerName === "resend" ? "resend" : null,
    providerApiKey: trimOptional(env.AUTH_EMAIL_PROVIDER_API_KEY),
    fromEmail: trimOptional(env.AUTH_EMAIL_FROM_EMAIL),
    fromName: trimOptional(env.AUTH_EMAIL_FROM_NAME) ?? "SundayEmpire",
    replyTo: trimOptional(env.AUTH_EMAIL_REPLY_TO),
    appBaseUrl,
  };
}

export function resolveEmailAppOrigin(
  fallbackOrigin: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const configured = resolveEmailDeliveryConfig(env).appBaseUrl;
  if (!configured) {
    return fallbackOrigin;
  }

  try {
    const parsed = new URL(configured);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch {
    logRuntime("warn", {
      event: "auth.email.invalid_app_base_url",
    });
  }

  return fallbackOrigin;
}

function createAttempt(
  input: Omit<EmailDeliveryAttempt, "provider" | "messageId" | "errorCode"> & {
    provider?: "resend" | null;
    messageId?: string | null;
    errorCode?: string | null;
  },
): EmailDeliveryAttempt {
  return {
    provider: input.provider ?? null,
    messageId: input.messageId ?? null,
    errorCode: input.errorCode ?? null,
    ...input,
  };
}

function hasSuccessfulAttempt(
  result: EmailDeliveryResult,
  channel: EmailDeliveryAttempt["channel"],
) {
  return result.attempts.some((attempt) => attempt.ok && attempt.channel === channel);
}

function isDeliveryNotConfigured(errorCode: string | null) {
  return (
    errorCode === "EMAIL_PROVIDER_DISABLED" ||
    errorCode === "EMAIL_PROVIDER_CONFIG_MISSING" ||
    errorCode === "EMAIL_DELIVERY_NOT_CONFIGURED"
  );
}

export function finalizeEmailDeliveryAttempts(
  attempts: EmailDeliveryAttempt[],
  fallbackCode = "EMAIL_DELIVERY_NOT_CONFIGURED",
): EmailDeliveryResult {
  const normalizedAttempts =
    attempts.length > 0
      ? attempts
      : [
          createAttempt({
            channel: "system",
            status: "failed",
            ok: false,
            errorCode: fallbackCode,
          }),
        ];

  const successfulAttempts = normalizedAttempts.filter((attempt) => attempt.ok);
  const primaryAttempt =
    successfulAttempts.find((attempt) => attempt.channel === "provider") ??
    successfulAttempts[0] ??
    normalizedAttempts[0];

  let summary: EmailDeliveryResult["summary"] = "failed";
  if (successfulAttempts.length > 1) {
    summary = "mixed";
  } else if (successfulAttempts.some((attempt) => attempt.channel === "provider")) {
    summary = "sent";
  } else if (successfulAttempts.some((attempt) => attempt.channel === "capture")) {
    summary = "captured";
  } else if (successfulAttempts.some((attempt) => attempt.channel === "console")) {
    summary = "logged";
  }

  return {
    ok: successfulAttempts.length > 0,
    summary,
    primaryChannel: primaryAttempt.channel,
    errorCode: successfulAttempts.length > 0 ? null : primaryAttempt.errorCode ?? fallbackCode,
    attempts: normalizedAttempts,
  };
}

export function toPublicEmailDeliveryResult(
  result: EmailDeliveryResult,
): PublicEmailDeliveryResult {
  return {
    ok: result.ok,
    summary: result.summary,
    primaryChannel: result.primaryChannel,
    errorCode: result.errorCode,
  };
}

export function normalizeEmailDeliveryResult(
  result: EmailDeliveryResult,
): NormalizedEmailDeliveryResult {
  if (result.ok) {
    if (hasSuccessfulAttempt(result, "provider")) {
      return {
        state: "sent",
        errorCode: null,
      };
    }

    if (hasSuccessfulAttempt(result, "capture")) {
      return {
        state: "captured",
        errorCode: null,
      };
    }

    if (hasSuccessfulAttempt(result, "console")) {
      return {
        state: "logged",
        errorCode: null,
      };
    }

    return {
      state: "sent",
      errorCode: null,
    };
  }

  if (isDeliveryNotConfigured(result.errorCode)) {
    return {
      state: "not_configured",
      errorCode: result.errorCode,
    };
  }

  return {
    state: "failed",
    errorCode: result.errorCode,
  };
}

async function sendViaResendProvider(
  config: EmailDeliveryConfig,
  message: PreparedEmailMessage,
  fetchFn: typeof fetch,
): Promise<EmailDeliveryAttempt> {
  if (!config.providerEnabled) {
    return createAttempt({
      channel: "provider",
      status: "failed",
      ok: false,
      provider: config.providerName,
      errorCode: "EMAIL_PROVIDER_DISABLED",
    });
  }

  if (
    config.providerName !== "resend" ||
    !config.providerApiKey ||
    !config.fromEmail
  ) {
    logRuntime("error", {
      event: "auth.email.provider_config_missing",
      emailKind: message.kind,
      recipient: maskEmailAddress(message.to),
    });
    return createAttempt({
      channel: "provider",
      status: "failed",
      ok: false,
      provider: config.providerName,
      errorCode: "EMAIL_PROVIDER_CONFIG_MISSING",
    });
  }

  try {
    const response = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.providerApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: `${config.fromName} <${config.fromEmail}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      id?: string;
      error?: {
        name?: string;
        message?: string;
      };
    };

    if (!response.ok) {
      const errorCode =
        payload.error?.name?.trim() ||
        `RESEND_${response.status}`;
      logRuntime("error", {
        event: "auth.email.send_failed",
        emailKind: message.kind,
        transport: "provider",
        provider: "resend",
        recipient: maskEmailAddress(message.to),
        errorCode,
        status: response.status,
      });
      return createAttempt({
        channel: "provider",
        status: "failed",
        ok: false,
        provider: "resend",
        errorCode,
      });
    }

    logRuntime("info", {
      event: "auth.email.sent",
      emailKind: message.kind,
      transport: "provider",
      provider: "resend",
      recipient: maskEmailAddress(message.to),
      messageId: trimOptional(payload.id),
    });

    return createAttempt({
      channel: "provider",
      status: "sent",
      ok: true,
      provider: "resend",
      messageId: trimOptional(payload.id),
    });
  } catch (error) {
    logRuntime("error", {
      event: "auth.email.send_failed",
      emailKind: message.kind,
      transport: "provider",
      provider: "resend",
      recipient: maskEmailAddress(message.to),
      errorCode: error instanceof Error ? error.name : "EMAIL_PROVIDER_ERROR",
    });

    return createAttempt({
      channel: "provider",
      status: "failed",
      ok: false,
      provider: "resend",
      errorCode: error instanceof Error ? error.name : "EMAIL_PROVIDER_ERROR",
    });
  }
}

function createConsoleAttempt(message: PreparedEmailMessage): EmailDeliveryAttempt {
  logRuntime("info", {
    event: "auth.email.console_delivery",
    emailKind: message.kind,
    transport: "console",
    recipient: maskEmailAddress(message.to),
    subject: message.subject,
    metadata: message.metadata ?? null,
  });

  return createAttempt({
    channel: "console",
    status: "logged",
    ok: true,
  });
}

export function createEmailDeliveryService(
  options: EmailDeliveryServiceOptions = {},
) {
  const config = options.config ?? resolveEmailDeliveryConfig();
  const fetchFn = options.fetchFn ?? fetch;

  return {
    async send(
      message: PreparedEmailMessage,
      input: {
        consoleLoggingEnabled?: boolean;
        captureActive?: boolean;
      } = {},
    ): Promise<EmailDeliveryResult> {
      logRuntime("info", {
        event: "auth.email.send_requested",
        emailKind: message.kind,
        recipient: maskEmailAddress(message.to),
        providerEnabled: config.providerEnabled,
        provider: config.providerName,
        consoleLoggingEnabled: Boolean(input.consoleLoggingEnabled),
        captureActive: Boolean(input.captureActive),
      });

      const attempts: EmailDeliveryAttempt[] = [];

      if (config.providerEnabled) {
        attempts.push(await sendViaResendProvider(config, message, fetchFn));
      }

      if (input.consoleLoggingEnabled) {
        attempts.push(createConsoleAttempt(message));
      }

      if (attempts.length === 0 && !input.captureActive) {
        logRuntime("warn", {
          event: "auth.email.delivery_skipped",
          emailKind: message.kind,
          recipient: maskEmailAddress(message.to),
          errorCode: "EMAIL_DELIVERY_NOT_CONFIGURED",
        });
      }

      return finalizeEmailDeliveryAttempts(attempts);
    },
  };
}
