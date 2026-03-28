import assert from "node:assert/strict";
import test from "node:test";
import { createActivityEventRepository } from "@/lib/repositories/activity/activity-event-repository";
import { createActivityPublisher } from "@/lib/domain/activity/activity-publisher";

test("activity repository and publisher expose the expected foundation methods", () => {
  const repository = createActivityEventRepository({} as never);
  const publisher = createActivityPublisher({} as never, {
    repository: {
      async create() {
        return null as never;
      },
      async findByDedupeKey() {
        return null;
      },
    },
  });

  assert.equal(typeof repository.create, "function");
  assert.equal(typeof repository.findById, "function");
  assert.equal(typeof repository.findByDedupeKey, "function");

  assert.equal(typeof publisher.publish, "function");
  assert.equal(typeof publisher.publishSafe, "function");
});
