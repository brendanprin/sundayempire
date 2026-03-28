import { NextResponse } from "next/server";

export function apiError(
  status: number,
  code: string,
  message: string,
  context?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        context: context ?? null,
      },
    },
    { status },
  );
}
