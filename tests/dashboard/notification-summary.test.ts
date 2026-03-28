import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationSummaryReadModel } from "@/lib/read-models/notifications/notification-summary";

test("notification summary read model returns unread count and stored rows", async () => {
  const readModel = createNotificationSummaryReadModel({
    notification: {
      async findMany() {
        return [
          {
            id: "note-1",
            eventType: "compliance.issue.created",
            title: "Cap warning created",
            body: "Your team exceeded the soft cap.",
            createdAt: new Date("2026-04-03T12:00:00.000Z"),
            readAt: null,
          },
          {
            id: "note-2",
            eventType: "commissioner.override.recorded",
            title: "Override recorded",
            body: "Commissioner ruling published.",
            createdAt: new Date("2026-04-02T12:00:00.000Z"),
            readAt: new Date("2026-04-02T13:00:00.000Z"),
          },
        ];
      },
      async count() {
        return 4;
      },
    },
  } as never);

  const result = await readModel.read({
    leagueId: "league-1",
    recipientUserId: "user-1",
    limit: 5,
    now: new Date("2026-04-04T00:00:00.000Z"),
  });

  assert.equal(result.unreadCount, 4);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0]?.category, "compliance");
  assert.equal(result.items[1]?.category, "commissioner");
});

test("notification summary read model stays empty-state safe", async () => {
  const readModel = createNotificationSummaryReadModel({
    notification: {
      async findMany() {
        return [];
      },
      async count() {
        return 0;
      },
    },
  } as never);

  const result = await readModel.read({
    leagueId: "league-1",
    recipientUserId: "user-1",
    now: new Date("2026-04-04T00:00:00.000Z"),
  });

  assert.equal(result.unreadCount, 0);
  assert.deepEqual(result.items, []);
});
