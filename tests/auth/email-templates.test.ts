import assert from "node:assert/strict";
import test from "node:test";
import {
  renderLeagueInviteEmailTemplate,
  renderMagicLinkEmailTemplate,
} from "@/lib/email/templates";

const NOW = new Date("2026-03-27T12:00:00.000Z");
const EXPIRES_AT = new Date("2026-03-27T12:15:00.000Z");

test("magic-link template renders branded HTML and text with secure sign-in copy", () => {
  const template = renderMagicLinkEmailTemplate({
    magicLinkUrl: "https://league.sundayempire.com/api/auth/session?token=magic-link-token",
    expiresAt: EXPIRES_AT,
    now: NOW,
  });

  assert.equal(template.subject, "Your SundayEmpire sign-in link");
  assert.ok(template.html.includes("SundayEmpire"));
  assert.ok(template.html.includes("Sign in to SundayEmpire"));
  assert.ok(template.html.includes("Sign In"));
  assert.ok(template.html.includes("https://league.sundayempire.com/api/auth/session?token=magic-link-token"));
  assert.ok(template.text.includes("If you did not request this sign-in email"));
  assert.ok(template.text.includes("This link expires in about 15 minutes."));
});

test("initial invite template includes league, role, team, and inviter context", () => {
  const template = renderLeagueInviteEmailTemplate({
    inviteUrl: "https://league.sundayempire.com/invite?token=invite-token",
    leagueName: "Empire League",
    intendedRole: "MEMBER",
    teamName: "Hudson Valley Kings",
    invitedByName: "Commissioner Jane",
    invitedByEmail: "commissioner@example.test",
    expiresAt: new Date("2026-03-29T12:00:00.000Z"),
    variant: "initial",
    now: NOW,
  });

  assert.equal(template.subject, "You're invited to join Empire League on SundayEmpire");
  assert.ok(template.html.includes("Join Empire League"));
  assert.ok(template.html.includes("Hudson Valley Kings"));
  assert.ok(template.html.includes("Member"));
  assert.ok(template.html.includes("Commissioner Jane"));
  assert.ok(template.text.includes("Review Invitation: https://league.sundayempire.com/invite?token=invite-token"));
  assert.ok(template.text.includes("sign in with the same email address"));
});

test("resend invite template clearly communicates that the latest link should be used", () => {
  const template = renderLeagueInviteEmailTemplate({
    inviteUrl: "https://league.sundayempire.com/invite?token=invite-token-2",
    leagueName: "Empire League",
    intendedRole: "MEMBER",
    expiresAt: EXPIRES_AT,
    variant: "resend",
    now: NOW,
  });

  assert.equal(template.subject, "Your latest SundayEmpire invite to Empire League");
  assert.ok(template.html.includes("Updated League Invite"));
  assert.ok(template.text.includes("Here is the latest invitation to join Empire League"));
  assert.ok(template.text.includes("this is the one to use now"));
  assert.ok(template.text.includes("Review Invitation: https://league.sundayempire.com/invite?token=invite-token-2"));
});
