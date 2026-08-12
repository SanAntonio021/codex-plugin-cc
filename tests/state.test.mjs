import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { makeTempDir } from "./helpers.mjs";
import { resolveJobFile, resolveJobLogFile, resolveStateDir, resolveStateFile, saveState } from "../plugins/codex/scripts/lib/state.mjs";

test("resolveStateDir uses a temp-backed per-workspace directory when CLAUDE_PLUGIN_DATA is unset", () => {
  const workspace = makeTempDir();
  const previousPluginDataDir = process.env.CLAUDE_PLUGIN_DATA;
  delete process.env.CLAUDE_PLUGIN_DATA;

  try {
    const stateDir = resolveStateDir(workspace);

    assert.match(path.basename(stateDir), /.+-[a-f0-9]{16}$/);
    // When CLAUDE_PLUGIN_DATA is unset the fallback is os.tmpdir()/codex-companion.
    // If the variable happens to be set in the outer environment, the test would
    // fail incorrectly, so we re-derive the expected root here.
    const expectedRoot = path.join(os.tmpdir(), "codex-companion");
    assert.equal(
      stateDir.toLowerCase().startsWith(expectedRoot.toLowerCase()),
      true,
      `stateDir "${stateDir}" should start with "${expectedRoot}"`
    );
  } finally {
    if (previousPluginDataDir == null) {
      delete process.env.CLAUDE_PLUGIN_DATA;
    } else {
      process.env.CLAUDE_PLUGIN_DATA = previousPluginDataDir;
    }
  }
});

test("resolveStateDir uses CLAUDE_PLUGIN_DATA when it is provided", () => {
  const workspace = makeTempDir();
  const pluginDataDir = makeTempDir();
  const previousPluginDataDir = process.env.CLAUDE_PLUGIN_DATA;
  process.env.CLAUDE_PLUGIN_DATA = pluginDataDir;

  try {
    const stateDir = resolveStateDir(workspace);

    assert.equal(stateDir.startsWith(path.join(pluginDataDir, "state")), true);
    assert.match(path.basename(stateDir), /.+-[a-f0-9]{16}$/);
    assert.match(
      stateDir,
      new RegExp(`^${path.join(pluginDataDir, "state").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
    );
  } finally {
    if (previousPluginDataDir == null) {
      delete process.env.CLAUDE_PLUGIN_DATA;
    } else {
      process.env.CLAUDE_PLUGIN_DATA = previousPluginDataDir;
    }
  }
});

test("saveState prunes dropped job artifacts when indexed jobs exceed the cap", () => {
  const workspace = makeTempDir();
  const stateFile = resolveStateFile(workspace);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });

  const jobs = Array.from({ length: 51 }, (_, index) => {
    const jobId = `job-${index}`;
    const updatedAt = new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString();
    const logFile = resolveJobLogFile(workspace, jobId);
    const jobFile = resolveJobFile(workspace, jobId);
    fs.writeFileSync(logFile, `log ${jobId}\n`, "utf8");
    fs.writeFileSync(jobFile, JSON.stringify({ id: jobId, status: "completed" }, null, 2), "utf8");
    return {
      id: jobId,
      status: "completed",
      logFile,
      updatedAt,
      createdAt: updatedAt
    };
  });

  fs.writeFileSync(
    stateFile,
    `${JSON.stringify(
      {
        version: 1,
        config: { stopReviewGate: false },
        jobs
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  saveState(workspace, {
    version: 1,
    config: { stopReviewGate: false },
    jobs
  });

  const prunedJobFile = resolveJobFile(workspace, "job-0");
  const prunedLogFile = resolveJobLogFile(workspace, "job-0");
  const retainedJobFile = resolveJobFile(workspace, "job-50");
  const retainedLogFile = resolveJobLogFile(workspace, "job-50");
  const jobsDir = path.dirname(prunedJobFile);

  assert.equal(fs.existsSync(retainedJobFile), true);
  assert.equal(fs.existsSync(retainedLogFile), true);

  const savedState = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  assert.equal(savedState.jobs.length, 50);
  assert.deepEqual(
    savedState.jobs.map((job) => job.id),
    Array.from({ length: 50 }, (_, index) => `job-${50 - index}`)
  );
  // The pruned job-0's JSON is gone, but its .log must NOT be deleted.
  assert.equal(fs.existsSync(prunedJobFile), false);
  assert.equal(fs.existsSync(prunedLogFile), true, ".log of a pruned job must be preserved");

  // All retained jobs keep both artifacts.
  const allFiles = fs.readdirSync(jobsDir).sort();
  for (let i = 1; i <= 50; i++) {
    assert.equal(allFiles.includes(`job-${i}.json`), true, `job-${i}.json should exist`);
    assert.equal(allFiles.includes(`job-${i}.log`), true, `job-${i}.log should exist`);
  }
});

test("saveState with removeJobIds deletes specified JSON but never the .log", () => {
  const workspace = makeTempDir();
  fs.mkdirSync(path.dirname(resolveStateFile(workspace)), { recursive: true });

  const jobId = "job-rm-test";
  const logFile = resolveJobLogFile(workspace, jobId);
  const jobFile = resolveJobFile(workspace, jobId);
  const updatedAt = new Date(Date.UTC(2026, 0, 1)).toISOString();

  fs.writeFileSync(logFile, "keep me\n", "utf8");
  fs.writeFileSync(jobFile, JSON.stringify({ id: jobId, status: "completed" }, null, 2), "utf8");

  const jobs = [{ id: jobId, status: "completed", logFile, updatedAt, createdAt: updatedAt }];

  saveState(workspace, { version: 1, config: { stopReviewGate: false }, jobs: [] }, {
    removeJobIds: [jobId]
  });

  assert.equal(fs.existsSync(jobFile), false, "JSON of removeJobIds entry must be deleted");
  assert.equal(fs.existsSync(logFile), true, ".log of removeJobIds entry must be preserved");
});
