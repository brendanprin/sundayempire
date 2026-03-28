import { csvManualPlayerDirectoryAdapter } from "@/lib/domain/player/adapters/csv-manual-adapter";
import { fantasyProsSeedPlayerDirectoryAdapter } from "@/lib/domain/player/adapters/fantasypros-seed-adapter";
import type { PlayerDirectoryAdapter } from "@/lib/domain/player/adapters/types";

const adapters = [
  csvManualPlayerDirectoryAdapter,
  fantasyProsSeedPlayerDirectoryAdapter,
] as const;

export function getPlayerDirectoryAdapter(
  adapterKey: string | null | undefined,
): PlayerDirectoryAdapter | null {
  const normalized = adapterKey?.trim().toLowerCase() ?? "csv-manual";
  return adapters.find((adapter) => adapter.key === normalized) ?? null;
}

export function listPlayerDirectoryAdapters() {
  return [...adapters];
}
