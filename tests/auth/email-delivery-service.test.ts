import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmailDeliveryService,
  maskEmailAddress,
  normalizeEmailDeliveryResult,
  resolveEmailAppOrigin,
  resolveEmailDeliveryConfig,
  type PreparedEmailMessage,
} from "@/lib/email/EmailDeliveryService";

function buildMessage(overrides: Partial<PreparedEmailMessage> = {}): PreparedEmailMessage {
  return {
    kind: "magic-link-sign-in",
    to: "owner@example.test",
    subject: "Your SundayEmpire sign-in link",
    html: "<a href=\"https://app.example.test/api/auth/session?token=secret-token\">Sign In</a>",
    text: "Sign In: https://app.example.test/api/auth/session?token=secret-token",
    metadata: {
      expiresAt: "2026-03-27T12:15:00.000Z",
    },
    ...overrides,
  };
}

async function captureConsole<T>(callback: (lines: string[]) => Promise<T> | T) {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  console.warn = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };

  try {
    return await callback(lines);
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
}

test("resolveEmailDeliveryConfig keeps provider delivery disabled during tests", () => {
  const config = resolveEmailDeliveryConfig({
    NODE_ENV: "test",
    AUTH_EMAIL_PROVIDER_ENABLED: "1",
    AUTH_EMAIL_PROVIDER: "resend",
    AUTH_EMAIL_PROVIDER_API_KEY: "re_test_key",
    AUTH_EMAIL_FROM_EMAIL: "noreply@example.test",
    AUTH_EMAIL_FROM_NAME: "SundayEmpire",
  });

  assert.equal(config.providerEnabled, false);
  assert.equal(config.providerName, "resend");
  assert.equal(config.fromEmail, "noreply@example.test");
});

test("resolveEmailAppOrigin prefers a valid configured app URL and falls back safely", async () => {
  assert.equal(
    resolveEmailAppOrigin("http://127.0.0.1:3000", {
      AUTH_APP_BASE_URL: "https://league.sundayempire.com/auth/callback",
    }),
    "https://league.sundayempire.com",
  );

  await captureConsole(async (lines) => {
    assert.equal(
      resolveEmailAppOrigin("http://127.0.0.1:3000", {
        AUTH_APP_BASE_URL: "not a url",
      }),
      "http://127.0.0.1:3000",
    );

    assert.ok(lines.some((line) => line.includes("auth.email.invalid_app_base_url")));
  });
});

test("provider-backed delivery sends through the configured adapter", async () => {
  const requests: Array<{
    url: string;
    init: RequestInit | undefined;
  }> = [];
  const service = createEmailDeliveryService({
    config: {
      providerEnabled: true,
      providerName: "resend",
      providerApiKey: "re_live_key",
      fromEmail: "noreply@sundayempire.com",
      fromName: "SundayEmpire",
      replyTo: "support@sundayempire.com",
      appBaseUrl: "https://league.sundayempire.com",
    },
    fetchFn: (async (url, init) => {
      requests.push({
        url: String(url),
        init,
      });
      return new Response(JSON.stringify({ id: "email-123" }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  const result = await service.send(buildMessage());

  assert.equal(result.ok, true);
  assert.equal(result.summary, "sent");
  assert.equal(result.primaryChannel, "provider");
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://api.resend.com/emails");
  const body = JSON.parse(String(requests[0]?.init?.body ?? "{}")) as {
    from: string;
    to: string[];
    subject: string;
    html: string;
    text: string;
    reply_to?: string;
  };
  assert.equal(body.from, "SundayEmpire <noreply@sundayempire.com>");
  assert.deepEqual(body.to, ["owner@example.test"]);
  assert.equal(body.reply_to, "support@sundayempire.com");
});

test("normalizeEmailDeliveryResult maps safe commissioner-facing delivery states", () => {
  assert.deepEqual(
    normalizeEmailDeliveryResult({
      ok: true,
      summary: "captured",
      primaryChannel: "capture",
      errorCode: null,
      attempts: [
        {
          channel: "capture",
          status: "captured",
          ok: true,
          provider: null,
          messageId: null,
          errorCode: null,
        },
      ],
    }),
    {
      state: "captured",
      errorCode: null,
    },
  );

  assert.deepEqual(
    normalizeEmailDeliveryResult({
      ok: false,
      summary: "failed",
      primaryChannel: "system",
      errorCode: "EMAIL_DELIVERY_NOT_CONFIGURED",
      attempts: [
        {
          channel: "system",
          status: "failed",
          ok: false,
          provider: null,
          messageId: null,
          errorCode: "EMAIL_DELIVERY_NOT_CONFIGURED",
        },
      ],
    }),
    {
      state: "not_configured",
      errorCode: "EMAIL_DELIVERY_NOT_CONFIGURED",
    },
  );
});

test("console delivery logs observability data without leaking raw tokens or URLs", async () => {
  await captureConsole(async (lines) => {
    const service = createEmailDeliveryService({
      config: {
        providerEnabled: false,
        providerName: null,
        providerApiKey: null,
        fromEmail: null,
        fromName: "SundayEmpire",
        replyTo: null,
        appBaseUrl: null,
      },
    });

    const result = await service.send(buildMessage(), {
      consoleLoggingEnabled: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.summary, "logged");
    assert.equal(result.primaryChannel, "console");

    const joinedLogs = lines.join("\n");
    assert.ok(joinedLogs.includes("auth.email.send_requested"));
    assert.ok(joinedLogs.includes("auth.email.console_delivery"));
    assert.ok(joinedLogs.includes(maskEmailAddress("owner@example.test")));
    assert.ok(!joinedLogs.includes("secret-token"));
    assert.ok(!joinedLogs.includes("https://app.example.test/api/auth/session"));
  });
});

test("delivery skipped logs a safe not-configured event without leaking raw tokens", async () => {
  await captureConsole(async (lines) => {
    const service = createEmailDeliveryService({
      config: {
        providerEnabled: false,
        providerName: null,
        providerApiKey: null,
        fromEmail: null,
        fromName: "SundayEmpire",
        replyTo: null,
        appBaseUrl: null,
      },
    });

    const result = await service.send(buildMessage());

    assert.equal(result.ok, false);
    assert.equal(result.errorCode, "EMAIL_DELIVERY_NOT_CONFIGURED");

    const joinedLogs = lines.join("\n");
    assert.ok(joinedLogs.includes("auth.email.delivery_skipped"));
    assert.ok(!joinedLogs.includes("secret-token"));
    assert.ok(!joinedLogs.includes("https://app.example.test/api/auth/session"));
  });
});

test("provider failures are logged without exposing raw delivery links", async () => {
  await captureConsole(async (lines) => {
    const service = createEmailDeliveryService({
      config: {
        providerEnabled: true,
        providerName: "resend",
        providerApiKey: "re_live_key",
        fromEmail: "noreply@sundayempire.com",
        fromName: "SundayEmpire",
        replyTo: null,
        appBaseUrl: "https://league.sundayempire.com",
      },
      fetchFn: (async () => {
        throw new Error("network failed");
      }) as typeof fetch,
    });

    const result = await service.send(buildMessage());

    assert.equal(result.ok, false);
    assert.equal(result.summary, "failed");
    assert.equal(result.errorCode, "Error");

    const joinedLogs = lines.join("\n");
    assert.ok(joinedLogs.includes("auth.email.send_failed"));
    assert.ok(joinedLogs.includes(maskEmailAddress("owner@example.test")));
    assert.ok(!joinedLogs.includes("secret-token"));
    assert.ok(!joinedLogs.includes("https://app.example.test/api/auth/session"));
  });
});
