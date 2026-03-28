import { NextResponse } from "next/server";
import { apiError } from "@/lib/api";
import { ApplicationResult } from "@/lib/application/result";

export function toApiResponse<T>(result: ApplicationResult<T>) {
  if (result.ok) {
    return NextResponse.json(result.data);
  }

  return apiError(result.error.status, result.error.code, result.error.message, result.error.context);
}
