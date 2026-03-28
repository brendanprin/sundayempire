import { DraftDbClient } from "@/lib/domain/draft/shared";
import { prisma } from "@/lib/prisma";

export function createPickOwnershipService(client: DraftDbClient = prisma) {
  return {
    async transferOwnership(input: {
      leagueId: string;
      seasonId: string;
      pickId: string;
      newTeamId: string;
    }) {
      const pick = await client.futurePick.findFirst({
        where: {
          id: input.pickId,
          leagueId: input.leagueId,
        },
        include: {
          originalTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
          currentTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
      });

      if (!pick) {
        throw new Error("PICK_NOT_FOUND");
      }

      const newTeam = await client.team.findFirst({
        where: {
          id: input.newTeamId,
          leagueId: input.leagueId,
        },
        select: {
          id: true,
          name: true,
          abbreviation: true,
        },
      });

      if (!newTeam) {
        throw new Error("TEAM_NOT_FOUND");
      }

      if (pick.currentTeamId === newTeam.id) {
        throw new Error("NO_TRANSFER_NEEDED");
      }

      const updatedPick = await client.futurePick.update({
        where: {
          id: pick.id,
        },
        data: {
          currentTeamId: newTeam.id,
        },
        include: {
          originalTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
          currentTeam: {
            select: {
              id: true,
              name: true,
              abbreviation: true,
            },
          },
        },
      });

      const rookieDrafts = await client.draft.findMany({
        where: {
          leagueId: input.leagueId,
          seasonId: input.seasonId,
          type: "ROOKIE",
          status: "NOT_STARTED",
        },
        select: {
          id: true,
        },
      });

      let orderEntryUpdates = 0;
      let draftPickUpdates = 0;

      for (const draft of rookieDrafts) {
        const orderEntryResult = await client.draftOrderEntry.updateMany({
          where: {
            draftId: draft.id,
            futurePickId: pick.id,
          },
          data: {
            owningTeamId: newTeam.id,
            selectingTeamId: newTeam.id,
          },
        });
        orderEntryUpdates += orderEntryResult.count;

        const draftPickResult = await client.draftPick.updateMany({
          where: {
            draftId: draft.id,
            futurePickId: pick.id,
            status: "PENDING",
          },
          data: {
            selectingTeamId: newTeam.id,
          },
        });
        draftPickUpdates += draftPickResult.count;
      }

      return {
        pick: updatedPick,
        fromTeamId: pick.currentTeamId,
        toTeamId: newTeam.id,
        orderEntryUpdates,
        draftPickUpdates,
      };
    },
  };
}

