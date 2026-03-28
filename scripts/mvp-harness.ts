import { spawnSync } from "node:child_process";

type ApiError = {
  error?: {
    code?: string;
    message?: string;
    context?: Record<string, unknown>;
  };
};

export const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
export const COMMISSIONER_EMAIL = process.env.DYNASTY_COMMISSIONER_EMAIL ?? "commissioner@local.league";
export const MEMBER_TEAM_EMAIL =
  process.env.DYNASTY_MEMBER_TEAM_EMAIL ??
  process.env.DYNASTY_OWNER_ONE_EMAIL ??
  "owner01@local.league";
export const MEMBER_TEAM_TWO_EMAIL =
  process.env.DYNASTY_MEMBER_TEAM_TWO_EMAIL ??
  process.env.DYNASTY_OWNER_TWO_EMAIL ??
  "owner02@local.league";
export const MEMBER_NO_TEAM_EMAIL =
  process.env.DYNASTY_MEMBER_NO_TEAM_EMAIL ??
  process.env.DYNASTY_READ_ONLY_EMAIL ??
  "readonly@local.league";

export type LeagueRecord = {
  id: string;
  name: string;
};

export type ActorRecord = {
  accountRole: "ADMIN" | "USER";
  leagueRole: "COMMISSIONER" | "MEMBER";
  teamId: string | null;
  teamName: string | null;
  leagueId: string;
};

type RequestJsonInput = {
  email?: string;
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  leagueId?: string | null;
};

function parseResponsePayload<T>(payload: T & ApiError, response: Response, method: string, path: string) {
  if (!response.ok || payload.error) {
    throw new Error(
      `${method} ${path} failed: ${payload.error?.message ?? response.statusText} (${payload.error?.code ?? "UNKNOWN"})`,
    );
  }

  return payload as T;
}

async function issueRequest(path: string, input: RequestJsonInput = {}) {
  const method = input.method ?? "GET";
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(input.body !== undefined ? { "content-type": "application/json" } : {}),
      "x-dynasty-user-email": input.email ?? COMMISSIONER_EMAIL,
      ...(input.leagueId ? { "x-dynasty-league-id": input.leagueId } : {}),
      ...(input.headers ?? {}),
    },
    ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
  });

  const payload = (await response.json()) as ApiError;
  return { method, response, payload };
}

export async function requestJson<T>(path: string, input: RequestJsonInput = {}) {
  const result = await issueRequest(path, input);
  return parseResponsePayload(result.payload as T & ApiError, result.response, result.method, path);
}

export async function requestJsonAllowError<T>(path: string, input: RequestJsonInput = {}) {
  const result = await issueRequest(path, input);
  return {
    ok: result.response.ok && !result.payload.error,
    status: result.response.status,
    payload: result.payload as T & ApiError,
    error: result.payload.error ?? null,
  };
}

export async function runStep<T>(label: string, action: () => Promise<T>) {
  try {
    return await action();
  } catch (error) {
    throw new Error(
      `[${label}] ${error instanceof Error ? error.message : "Unexpected rehearsal failure."}`,
    );
  }
}

export async function getPrimaryLeague(email = COMMISSIONER_EMAIL) {
  const payload = await requestJson<{ leagues: LeagueRecord[] }>("/api/leagues", { email });
  const league = payload.leagues[0] ?? null;

  if (!league) {
    throw new Error("No leagues were available.");
  }

  return league;
}

export async function activateLeagueContext(leagueId: string, email = COMMISSIONER_EMAIL) {
  await requestJson<{ league: { id: string } }>("/api/league/context", {
    email,
    method: "POST",
    body: { leagueId },
  });
}

export async function getActor(email = COMMISSIONER_EMAIL, leagueId?: string | null) {
  const payload = await requestJson<{ actor: ActorRecord }>("/api/auth/me", {
    email,
    leagueId,
  });
  return payload.actor;
}

export async function resolvePrimaryLeagueAndActivate(emails: string[]) {
  const league = await getPrimaryLeague();

  for (const email of emails) {
    await activateLeagueContext(league.id, email);
  }

  return league;
}

export function parsePortFromBaseUrl() {
  const url = new URL(BASE_URL);
  if (url.port) {
    return url.port;
  }
  return url.protocol === "https:" ? "443" : "80";
}

export function runNpmScript(script: string, extraEnv: Record<string, string> = {}) {
  return runNpmScriptWithArgs(script, [], extraEnv);
}

export function runNpmScriptWithArgs(
  script: string,
  args: string[],
  extraEnv: Record<string, string> = {},
) {
  const npmArgs = args.length > 0 ? ["run", script, "--", ...args] : ["run", script];
  const result = spawnSync("npm", npmArgs, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      BASE_URL,
      ...extraEnv,
    },
  });

  if (result.status !== 0) {
    const renderedArgs = args.length > 0 ? ` -- ${args.join(" ")}` : "";
    throw new Error(`npm run ${script}${renderedArgs} failed with exit code ${result.status ?? 1}.`);
  }
}
