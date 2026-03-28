import { AuctionDbClient } from "@/lib/domain/auction/shared";
import { createAuctionPoolService } from "@/lib/domain/auction/auction-pool-service";
import { prisma } from "@/lib/prisma";

export function createEmergencyFillInService(client: AuctionDbClient = prisma) {
  const poolService = createAuctionPoolService(client);

  return {
    async createEmergencyFillInPool(input: {
      draftId: string;
      leagueId: string;
      seasonId: string;
      createdByUserId?: string | null;
      selectedPlayerIds: string[];
    }) {
      return poolService.generatePool({
        draftId: input.draftId,
        leagueId: input.leagueId,
        seasonId: input.seasonId,
        createdByUserId: input.createdByUserId ?? null,
        regenerate: true,
        selectedPlayerIds: input.selectedPlayerIds,
      });
    },
  };
}
