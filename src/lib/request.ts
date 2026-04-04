import { NextRequest } from "next/server";
import { apiError } from "@/lib/api";

type JsonBodyOk<T> = { ok: true; data: T };
type JsonBodyFail = { ok: false; response: ReturnType<typeof apiError> };

export async function parseJsonBody<T>(request: NextRequest): Promise<JsonBodyOk<T> | JsonBodyFail> {
  try {
    const data = (await request.json()) as T;
    return { ok: true, data };
  } catch {
    return {
      ok: false,
      response: apiError(400, "INVALID_JSON", "Request body must be valid JSON."),
    };
  }
}

export function parseBooleanParam(value: string | null): boolean | undefined {
  if (value === null) {
    return undefined;
  }

  const lowered = value.toLowerCase();
  if (lowered === "true" || lowered === "1" || lowered === "yes") {
    return true;
  }

  if (lowered === "false" || lowered === "0" || lowered === "no") {
    return false;
  }

  return undefined;
}

export function parseIntegerParam(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }

  return parsed;
}
