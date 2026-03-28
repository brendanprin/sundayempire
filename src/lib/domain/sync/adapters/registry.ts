import { csvManualSyncAdapter } from "@/lib/domain/sync/adapters/csv-manual-adapter";
import type { SyncProviderAdapter } from "@/lib/domain/sync/adapters/types";

const adapters = [csvManualSyncAdapter] as const;

export function getSyncProviderAdapter(adapterKey: string | null | undefined): SyncProviderAdapter | null {
  const normalized = adapterKey?.trim().toLowerCase() ?? "csv-manual";
  return adapters.find((adapter) => adapter.key === normalized) ?? null;
}

export function listSyncProviderAdapters() {
  return [...adapters];
}
