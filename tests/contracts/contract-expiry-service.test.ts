import assert from "node:assert/strict";
import test from "node:test";
import { createContractExpiryServiceWithDependencies } from "@/lib/domain/contracts/contract-expiry-service";

test("may 1 expiry service releases expiring non-tagged contracts after the deadline", async () => {
  const updatedContracts: string[] = [];
  const deletedRosterSlots: string[] = [];
  const releasedAssignments: string[] = [];
  const syncedLedgers: string[] = [];

  const service = createContractExpiryServiceWithDependencies(
    {
      season: {
        async findUnique() {
          return {
            id: "season-2025",
            year: 2025,
          };
        },
      },
      contract: {
        async findMany() {
          return [
            {
              id: "contract-expiring",
              teamId: "team-1",
              playerId: "player-1",
            },
          ];
        },
        async update(args: { where: { id: string } }) {
          updatedContracts.push(args.where.id);
          return args;
        },
      },
      rosterSlot: {
        async deleteMany(args: { where: { playerId: string } }) {
          deletedRosterSlots.push(args.where.playerId);
          return { count: 1 };
        },
      },
    } as never,
    {
      ledgerService: {
        async syncContractLedger(contractId: string) {
          syncedLedgers.push(contractId);
          return null;
        },
      },
      rosterAssignmentService: {
        async releaseAssignment(input: { playerId: string }) {
          releasedAssignments.push(input.playerId);
          return null;
        },
      },
    },
  );

  const result = await service.processMay1Expiries({
    seasonId: "season-2025",
    asOf: new Date("2025-05-10T00:00:00.000Z"),
  });

  assert.equal(result.processed, true);
  assert.deepEqual(result.expiredContractIds, ["contract-expiring"]);
  assert.deepEqual(updatedContracts, ["contract-expiring"]);
  assert.deepEqual(deletedRosterSlots, ["player-1"]);
  assert.deepEqual(releasedAssignments, ["player-1"]);
  assert.deepEqual(syncedLedgers, ["contract-expiring"]);
});

test("may 1 expiry service is a no-op before the deadline", async () => {
  const service = createContractExpiryServiceWithDependencies(
    {
      season: {
        async findUnique() {
          return {
            id: "season-2025",
            year: 2025,
          };
        },
      },
      contract: {
        async findMany() {
          throw new Error("should not load contracts before May 1");
        },
      },
    } as never,
    {
      ledgerService: {
        async syncContractLedger() {
          return null;
        },
      },
      rosterAssignmentService: {
        async releaseAssignment() {
          return null;
        },
      },
    },
  );

  const result = await service.processMay1Expiries({
    seasonId: "season-2025",
    asOf: new Date("2025-04-20T00:00:00.000Z"),
  });

  assert.equal(result.processed, false);
  assert.deepEqual(result.expiredContractIds, []);
});
