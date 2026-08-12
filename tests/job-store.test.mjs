import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import { resolveJobFile, resolveStateFile, saveState } from "../plugins/codex/scripts/lib/state.mjs";
import { resolveJobRecord, resolveAllJobs } from "../plugins/codex/scripts/lib/job-store.mjs";

test("resolveJobRecord reconciles index-only job", () => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });

  const job = {
    id: "job-1",
    status: "completed",
    phase: "done",
    updatedAt: "2026-08-12T10:00:00.000Z",
    createdAt: "2026-08-12T09:00:00.000Z"
  };

  fs.writeFileSync(
    stateFile,
    JSON.stringify({ version: 1, config: {}, jobs: [job] }, null, 2),
    "utf8"
  );

  const resolved = resolveJobRecord(workspace, "job-1");
  assert.deepEqual(resolved.status, "completed");
  assert.deepEqual(resolved.id, "job-1");
});

test("resolveJobRecord reconciles file-only job", () => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  const jobFile = resolveJobFile(workspace, "job-2");
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.mkdirSync(path.dirname(jobFile), { recursive: true });

  fs.writeFileSync(
    stateFile,
    JSON.stringify({ version: 1, config: {}, jobs: [] }, null, 2),
    "utf8"
  );

  const jobData = {
    id: "job-2",
    status: "failed",
    phase: "exec",
    errorMessage: "timeout",
    updatedAt: "2026-08-12T10:30:00.000Z",
    createdAt: "2026-08-12T10:00:00.000Z"
  };
  fs.writeFileSync(jobFile, JSON.stringify(jobData, null, 2), "utf8");

  const resolved = resolveJobRecord(workspace, "job-2");
  assert.equal(resolved.status, "failed");
  assert.equal(resolved.errorMessage, "timeout");

  // Verify index was patched
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.jobs.length, 1);
  assert.equal(state.jobs[0].id, "job-2");
  assert.equal(state.jobs[0].status, "failed");
});

test("resolveJobRecord reconciles conflicting status by rank", () => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  const jobFile = resolveJobFile(workspace, "job-3");
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.mkdirSync(path.dirname(jobFile), { recursive: true });

  const indexJob = {
    id: "job-3",
    status: "running",
    phase: "exec",
    pid: 12345,
    updatedAt: "2026-08-12T11:00:00.000Z",
    createdAt: "2026-08-12T10:00:00.000Z"
  };

  const fileJob = {
    id: "job-3",
    status: "completed",
    phase: "done",
    pid: null,
    completedAt: "2026-08-12T11:05:00.000Z",
    updatedAt: "2026-08-12T11:05:00.000Z",
    createdAt: "2026-08-12T10:00:00.000Z"
  };

  fs.writeFileSync(
    stateFile,
    JSON.stringify({ version: 1, config: {}, jobs: [indexJob] }, null, 2),
    "utf8"
  );
  fs.writeFileSync(jobFile, JSON.stringify(fileJob, null, 2), "utf8");

  const resolved = resolveJobRecord(workspace, "job-3");
  // completed (rank 2) wins over running (rank 1)
  assert.equal(resolved.status, "completed");
  assert.equal(resolved.pid, null);

  // Verify index was patched
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.jobs[0].status, "completed");
});

test("resolveJobRecord reconciles same rank by timestamp", () => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  const jobFile = resolveJobFile(workspace, "job-4");
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.mkdirSync(path.dirname(jobFile), { recursive: true });

  const indexJob = {
    id: "job-4",
    status: "completed",
    phase: "done",
    updatedAt: "2026-08-12T12:00:00.000Z",
    createdAt: "2026-08-12T11:00:00.000Z"
  };

  const fileJob = {
    id: "job-4",
    status: "completed",
    phase: "done",
    summary: "extra field from file",
    updatedAt: "2026-08-12T12:05:00.000Z",
    createdAt: "2026-08-12T11:00:00.000Z"
  };

  fs.writeFileSync(
    stateFile,
    JSON.stringify({ version: 1, config: {}, jobs: [indexJob] }, null, 2),
    "utf8"
  );
  fs.writeFileSync(jobFile, JSON.stringify(fileJob, null, 2), "utf8");

  const resolved = resolveJobRecord(workspace, "job-4");
  // Same rank, later timestamp from file wins
  assert.equal(resolved.summary, "extra field from file");

  // Verify index was patched
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(state.jobs[0].summary, "extra field from file");
});

test("resolveAllJobs returns all jobs from both stores", () => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });

  const indexJobs = [
    { id: "job-a", status: "completed", updatedAt: "2026-08-12T10:00:00.000Z", createdAt: "2026-08-12T09:00:00.000Z" },
    { id: "job-b", status: "running", pid: 999, updatedAt: "2026-08-12T10:30:00.000Z", createdAt: "2026-08-12T10:00:00.000Z" }
  ];

  fs.writeFileSync(
    stateFile,
    JSON.stringify({ version: 1, config: {}, jobs: indexJobs }, null, 2),
    "utf8"
  );

  const jobFileC = resolveJobFile(workspace, "job-c");
  fs.mkdirSync(path.dirname(jobFileC), { recursive: true });
  fs.writeFileSync(
    jobFileC,
    JSON.stringify({ id: "job-c", status: "failed", updatedAt: "2026-08-12T11:00:00.000Z", createdAt: "2026-08-12T10:30:00.000Z" }, null, 2),
    "utf8"
  );

  const all = resolveAllJobs(workspace);
  assert.equal(all.length, 3);
  const ids = all.map((j) => j.id).sort();
  assert.deepEqual(ids, ["job-a", "job-b", "job-c"]);
});
