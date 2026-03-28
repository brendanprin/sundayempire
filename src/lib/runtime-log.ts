import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";

type LogLevel = "info" | "warn" | "error";

type RuntimeLogPayload = {
  event: string;
  requestId?: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  path?: string;
  method?: string;
  [key: string]: unknown;
};

export function resolveRequestId(request: NextRequest): string {
  return request.headers.get("x-request-id")?.trim() || randomUUID();
}

export function logRuntime(level: LogLevel, payload: RuntimeLogPayload): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
    ...payload,
  });

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

