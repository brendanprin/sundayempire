import type { TradeAssetSelectionInput } from "@/types/trade-workflow";

type ParsedTradePackageRequest = {
  proposerTeamId: string;
  counterpartyTeamId: string;
  proposerAssets: TradeAssetSelectionInput[];
  counterpartyAssets: TradeAssetSelectionInput[];
};

function normalizeAssetList(raw: unknown): TradeAssetSelectionInput[] {
  if (!Array.isArray(raw)) {
    throw new Error("INVALID_REQUEST");
  }

  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("INVALID_REQUEST");
    }

    const assetType = (entry as { assetType?: unknown }).assetType;
    const playerId = (entry as { playerId?: unknown }).playerId;
    const futurePickId = (entry as { futurePickId?: unknown }).futurePickId;

    if (assetType !== "PLAYER" && assetType !== "PICK") {
      throw new Error("INVALID_REQUEST");
    }

    if (assetType === "PLAYER") {
      if (typeof playerId !== "string" || playerId.trim().length === 0) {
        throw new Error("INVALID_REQUEST");
      }

      return {
        assetType,
        playerId: playerId.trim(),
      };
    }

    if (typeof futurePickId !== "string" || futurePickId.trim().length === 0) {
      throw new Error("INVALID_REQUEST");
    }

    return {
      assetType,
      futurePickId: futurePickId.trim(),
    };
  });
}

export function parseTradePackageRequest(body: unknown): ParsedTradePackageRequest {
  if (!body || typeof body !== "object") {
    throw new Error("INVALID_REQUEST");
  }

  const proposerTeamId =
    typeof (body as { proposerTeamId?: unknown }).proposerTeamId === "string"
      ? (body as { proposerTeamId: string }).proposerTeamId.trim()
      : "";
  const counterpartyTeamId =
    typeof (body as { counterpartyTeamId?: unknown }).counterpartyTeamId === "string"
      ? (body as { counterpartyTeamId: string }).counterpartyTeamId.trim()
      : "";

  if (!proposerTeamId || !counterpartyTeamId) {
    throw new Error("INVALID_REQUEST");
  }

  return {
    proposerTeamId,
    counterpartyTeamId,
    proposerAssets: normalizeAssetList(
      (body as { proposerAssets?: unknown }).proposerAssets ?? [],
    ),
    counterpartyAssets: normalizeAssetList(
      (body as { counterpartyAssets?: unknown }).counterpartyAssets ?? [],
    ),
  };
}

