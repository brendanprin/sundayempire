import { createHash, timingSafeEqual } from "node:crypto";

export function hashOpaqueTokenSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function opaqueTokenHashesEqual(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");

    if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function buildOpaqueToken(recordId: string, secret: string) {
  return `${recordId}.${secret}`;
}

export function parseOpaqueToken(token: string) {
  const trimmed = token.trim();
  const separatorIndex = trimmed.indexOf(".");

  if (separatorIndex <= 0 || separatorIndex >= trimmed.length - 1) {
    return null;
  }

  return {
    recordId: trimmed.slice(0, separatorIndex),
    secret: trimmed.slice(separatorIndex + 1),
  };
}
