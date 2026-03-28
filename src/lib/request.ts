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
