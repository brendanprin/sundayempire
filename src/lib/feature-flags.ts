function isTruthyFlag(value: string | undefined) {
  return value === "1" || value === "true";
}

// This gates the commissioner lifecycle read surface only.
// Canonical lifecycle storage and legacy compatibility shims remain active regardless.
export function isNewLifecycleEngineEnabled() {
  return isTruthyFlag(process.env.NEW_LIFECYCLE_ENGINE);
}
