import {
  FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID,
  FANTASYPROS_DRAFT_RANKINGS_PROVIDER_VERSION,
  fantasyProsSeedExternalIdForRanking,
  loadFantasyProsDraftRankings,
} from "../../src/lib/fantasypros-draft-rankings";
import { loadMockRookieClassPlayers } from "../../src/lib/mock-rookie-class";
import { normalizeProviderPlayers, PlayerDataProvider } from "../player-data-provider";

export function createFantasyProsSeedProvider(
  version = FANTASYPROS_DRAFT_RANKINGS_PROVIDER_VERSION,
): PlayerDataProvider {
  return {
    id: FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID,
    version,
    loadPlayers: async () => {
      const veteranPlayers = loadFantasyProsDraftRankings().map((ranking) => {
        const externalId = fantasyProsSeedExternalIdForRanking(ranking, version);

        return {
          sourceKey: FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID,
          sourcePlayerId: externalId,
          externalId,
          name: ranking.name,
          displayName: ranking.name,
          position: ranking.position,
          nflTeam: ranking.nflTeam,
          age: null,
          yearsPro: null,
          statusCode: null,
          statusText: null,
        };
      });

      const rookiePlayers = loadMockRookieClassPlayers().map((player) => ({
        sourceKey: player.sourceKey,
        sourcePlayerId: player.sourcePlayerId,
        externalId: `${FANTASYPROS_DRAFT_RANKINGS_PROVIDER_ID}-v${version}-rookie-${player.sourcePlayerId}`,
        name: player.name,
        displayName: player.displayName,
        position: player.position,
        nflTeam: player.nflTeam,
        age: null,
        yearsPro: player.yearsPro,
        statusCode: player.statusCode,
        statusText: player.statusText,
        isRestricted: player.isRestricted,
      }));

      return normalizeProviderPlayers([...veteranPlayers, ...rookiePlayers]);
    },
  };
}
