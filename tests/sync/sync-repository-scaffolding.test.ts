import assert from "node:assert/strict";
import test from "node:test";
import { createHostPlatformSyncJobRepository } from "@/lib/repositories/sync/host-platform-sync-job-repository";
import { createSyncMismatchRepository } from "@/lib/repositories/sync/sync-mismatch-repository";

test("sync repository scaffolding exposes job and mismatch methods", () => {
  const stubClient = {} as never;

  const jobs = createHostPlatformSyncJobRepository(stubClient);
  const mismatches = createSyncMismatchRepository(stubClient);

  assert.equal(typeof jobs.create, "function");
  assert.equal(typeof jobs.findById, "function");
  assert.equal(typeof jobs.listByLeague, "function");
  assert.equal(typeof jobs.update, "function");

  assert.equal(typeof mismatches.create, "function");
  assert.equal(typeof mismatches.findById, "function");
  assert.equal(typeof mismatches.findOpenByFingerprint, "function");
  assert.equal(typeof mismatches.listForLeague, "function");
  assert.equal(typeof mismatches.listForJob, "function");
  assert.equal(typeof mismatches.update, "function");
});
