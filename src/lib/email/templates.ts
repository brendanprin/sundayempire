import { formatEnumLabel } from "@/lib/format-label";

type RenderedEmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value: Date) {
  return value.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function describeExpiry(expiresAt: Date, now: Date) {
  const diffMs = expiresAt.getTime() - now.getTime();
  if (diffMs <= 0) {
    return "This link has expired.";
  }

  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) {
    return `This link expires in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `This link expires in about ${hours} hour${hours === 1 ? "" : "s"}.`;
  }

  const days = Math.round(hours / 24);
  return `This link expires in about ${days} day${days === 1 ? "" : "s"}.`;
}

function renderEmailLayout(input: {
  eyebrow: string;
  title: string;
  intro: string;
  detailRows?: Array<{
    label: string;
    value: string;
  }>;
  ctaLabel: string;
  ctaUrl: string;
  supportLines: string[];
  closingLines: string[];
}) {
  const detailRowsHtml =
    input.detailRows && input.detailRows.length > 0
      ? `
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 24px 0; border-collapse: collapse; border: 1px solid #CBD5E1; border-radius: 12px; overflow: hidden;">
          ${input.detailRows
            .map(
              (row) => `
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E2E8F0; background: #F8FAFC; color: #475569; font-size: 13px; font-weight: 600; width: 140px;">
                    ${escapeHtml(row.label)}
                  </td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #E2E8F0; background: #FFFFFF; color: #0F172A; font-size: 14px;">
                    ${escapeHtml(row.value)}
                  </td>
                </tr>
              `,
            )
            .join("")}
        </table>
      `
      : "";

  const supportHtml = input.supportLines
    .map((line) => `<p style="margin: 0 0 10px; color: #475569; font-size: 14px; line-height: 1.6;">${escapeHtml(line)}</p>`)
    .join("");
  const closingHtml = input.closingLines
    .map((line) => `<p style="margin: 0 0 10px; color: #334155; font-size: 13px; line-height: 1.6;">${escapeHtml(line)}</p>`)
    .join("");

  const textDetailRows =
    input.detailRows?.map((row) => `${row.label}: ${row.value}`).join("\n") ?? "";

  return {
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <body style="margin: 0; padding: 0; background: #0F172A; color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
          <div style="padding: 32px 16px; background: linear-gradient(180deg, #0F172A 0%, #111827 100%);">
            <div style="max-width: 620px; margin: 0 auto;">
              <div style="padding: 16px 0 20px; text-align: center; color: #C9A227; font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase; font-weight: 700;">
                SundayEmpire
              </div>
              <div style="background: #F5F1E8; border-radius: 18px; overflow: hidden; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35);">
                <div style="padding: 32px 32px 24px; border-bottom: 1px solid rgba(71, 85, 105, 0.2);">
                  <p style="margin: 0 0 12px; color: #8B1E2D; font-size: 12px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700;">
                    ${escapeHtml(input.eyebrow)}
                  </p>
                  <h1 style="margin: 0 0 16px; color: #0F172A; font-size: 30px; line-height: 1.2;">
                    ${escapeHtml(input.title)}
                  </h1>
                  <p style="margin: 0; color: #334155; font-size: 16px; line-height: 1.7;">
                    ${escapeHtml(input.intro)}
                  </p>
                  ${detailRowsHtml}
                  <div style="margin: 28px 0 20px;">
                    <a href="${escapeHtml(input.ctaUrl)}" style="display: inline-block; padding: 14px 22px; border-radius: 999px; background: #C9A227; color: #0F172A; font-size: 14px; font-weight: 700; text-decoration: none;">
                      ${escapeHtml(input.ctaLabel)}
                    </a>
                  </div>
                  <p style="margin: 0 0 10px; color: #475569; font-size: 13px; line-height: 1.6;">
                    If the button above does not open, use this secure link:
                  </p>
                  <p style="margin: 0; color: #0F172A; font-size: 13px; line-height: 1.7; word-break: break-all;">
                    ${escapeHtml(input.ctaUrl)}
                  </p>
                </div>
                <div style="padding: 24px 32px 28px;">
                  ${supportHtml}
                  <div style="margin-top: 18px; padding-top: 18px; border-top: 1px solid rgba(71, 85, 105, 0.2);">
                    ${closingHtml}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: [
      "SundayEmpire",
      "",
      input.title,
      input.intro,
      "",
      textDetailRows,
      textDetailRows ? "" : null,
      `${input.ctaLabel}: ${input.ctaUrl}`,
      "",
      ...input.supportLines,
      "",
      ...input.closingLines,
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n"),
  };
}

export function renderMagicLinkEmailTemplate(input: {
  magicLinkUrl: string;
  expiresAt: Date;
  now?: Date;
}): RenderedEmailTemplate {
  const now = input.now ?? new Date();
  return {
    subject: "Your SundayEmpire sign-in link",
    ...renderEmailLayout({
      eyebrow: "Secure Sign-In",
      title: "Sign in to SundayEmpire",
      intro:
        "Use the secure link below to finish signing in to your SundayEmpire account and continue where you left off.",
      ctaLabel: "Sign In",
      ctaUrl: input.magicLinkUrl,
      supportLines: [
        describeExpiry(input.expiresAt, now),
        `For your security, this link also expires on ${formatDateTime(input.expiresAt)}.`,
      ],
      closingLines: [
        "If you did not request this sign-in email, you can safely ignore it.",
        "This message only helps someone sign in if they also have access to this inbox.",
      ],
    }),
  };
}

export function renderLeagueInviteEmailTemplate(input: {
  inviteUrl: string;
  leagueName: string;
  intendedRole: "COMMISSIONER" | "MEMBER";
  teamName?: string | null;
  invitedByName?: string | null;
  invitedByEmail?: string | null;
  expiresAt: Date;
  variant: "initial" | "resend";
  now?: Date;
}): RenderedEmailTemplate {
  const now = input.now ?? new Date();
  const roleLabel = formatEnumLabel(input.intendedRole);
  const inviterLabel = input.invitedByName?.trim() || input.invitedByEmail?.trim() || null;
  const subject =
    input.variant === "resend"
      ? `Your latest SundayEmpire invite to ${input.leagueName}`
      : `You're invited to join ${input.leagueName} on SundayEmpire`;

  const intro =
    input.variant === "resend"
      ? `Here is the latest invitation to join ${input.leagueName} on SundayEmpire. If you received an earlier invite, use this one instead.`
      : `You've been invited to join ${input.leagueName} on SundayEmpire and finish your league access with a secure invite flow.`;

  const supportLines = [
    describeExpiry(input.expiresAt, now),
    `This invitation is currently valid until ${formatDateTime(input.expiresAt)}.`,
  ];

  if (input.variant === "resend") {
    supportLines.push("This email contains the current invite link. If an earlier invite was still pending, this is the one to use now.");
  }

  return {
    subject,
    ...renderEmailLayout({
      eyebrow: input.variant === "resend" ? "Updated League Invite" : "League Invitation",
      title: `Join ${input.leagueName}`,
      intro,
      detailRows: [
        {
          label: "League",
          value: input.leagueName,
        },
        {
          label: "Access",
          value: roleLabel,
        },
        ...(input.teamName
          ? [
              {
                label: "Team",
                value: input.teamName,
              },
            ]
          : []),
        ...(inviterLabel
          ? [
              {
                label: "Sent By",
                value: inviterLabel,
              },
            ]
          : []),
      ],
      ctaLabel: "Review Invitation",
      ctaUrl: input.inviteUrl,
      supportLines,
      closingLines: [
        "To accept this invite, sign in with the same email address that received this message.",
        "If you were not expecting this invite, you can ignore this email.",
      ],
    }),
  };
}
