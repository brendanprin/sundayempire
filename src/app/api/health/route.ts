import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "dynasty-football",
    env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
    version: process.env.APP_VERSION ?? "dev",
    checkedAt: new Date().toISOString(),
  });
}

