export const HEADER_EMAIL = "x-dynasty-user-email";
export const HEADER_LEAGUE_ID = "x-dynasty-league-id";
export const ACTIVE_LEAGUE_COOKIE = "dynasty_league_id";
export const AUTH_EMAIL_COOKIE = "dynasty_auth_email";
export const AUTH_SESSION_COOKIE = "dynasty_session";
export const AUTH_MAGIC_LINK_PURPOSE_SIGN_IN = "SIGN_IN";
export const AUTH_MAGIC_LINK_TOKEN_PARAM = "token";
export const AUTH_MAGIC_LINK_DEFAULT_TTL_MINUTES = 15;
export const AUTH_INVITE_TOKEN_PARAM = "token";
export const AUTH_INVITE_DEFAULT_TTL_DAYS = 7;
export const AUTH_PLATFORM_INVITE_TOKEN_PARAM = "token";
export const AUTH_PLATFORM_INVITE_DEFAULT_TTL_DAYS = 7;
export const AUTH_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const LEGACY_AUTH_COMPAT_ENV = "AUTH_COMPAT_ALLOW_LEGACY_IDENTITY";
const DEMO_AUTH_LOGIN_ENV = "AUTH_DEMO_LOGIN_ENABLED";
const MAGIC_LINK_TEST_CAPTURE_ENV = "AUTH_MAGIC_LINK_TEST_CAPTURE";
const MAGIC_LINK_CONSOLE_LOG_ENV = "AUTH_MAGIC_LINK_CONSOLE_LOG";
const INVITE_TEST_CAPTURE_ENV = "AUTH_INVITE_TEST_CAPTURE";
const INVITE_CONSOLE_LOG_ENV = "AUTH_INVITE_CONSOLE_LOG";

function readExplicitBooleanFlag(envName: string) {
  const value = process.env[envName]?.trim().toLowerCase();

  if (value === "1" || value === "true") {
    return true;
  }

  if (value === "0" || value === "false") {
    return false;
  }

  return false;
}

export function isLegacyAuthCompatibilityEnabled() {
  return readExplicitBooleanFlag(LEGACY_AUTH_COMPAT_ENV);
}

export function isDemoAuthLoginEnabled() {
  return isLegacyAuthCompatibilityEnabled() && readExplicitBooleanFlag(DEMO_AUTH_LOGIN_ENV);
}

export function isMagicLinkTestCaptureEnabled() {
  return readExplicitBooleanFlag(MAGIC_LINK_TEST_CAPTURE_ENV);
}

export function isMagicLinkConsoleLoggingEnabled() {
  return readExplicitBooleanFlag(MAGIC_LINK_CONSOLE_LOG_ENV);
}

export function isInviteTestCaptureEnabled() {
  return (
    readExplicitBooleanFlag(INVITE_TEST_CAPTURE_ENV) || isMagicLinkTestCaptureEnabled()
  );
}

export function isInviteConsoleLoggingEnabled() {
  return (
    readExplicitBooleanFlag(INVITE_CONSOLE_LOG_ENV) || isMagicLinkConsoleLoggingEnabled()
  );
}

export function isInviteManagementCopyLinkEnabled() {
  return process.env.NODE_ENV !== "production" || isInviteTestCaptureEnabled();
}
