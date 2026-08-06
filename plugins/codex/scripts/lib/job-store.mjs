/**
 * Unified job read layer — resolves the dual-store inconsistency between
 * state.json (index) and jobs/<id>.json (single file).
 *
 * When both sources exist but disagree on status, the "more terminal" status wins:
 *   queued < running < completed/failed/cancelled
 * Among equally terminal statuses, the later timestamp wins.
 * The losing source is patched to match.
 */

import fs from "node:fs";

import { listJobs, readJobFile, resolveJobFile, upsertJob, writeJobFile } from "./state.mjs";

/** Terminal-rank for status comparison. Higher = more terminal. */
const STATUS_RANK = {
  queued: 0,
  running: 1,
  completed: 2,
  failed: 2,
  cancelled: 2
};

function rankOf(status) {
  return STATUS_RANK[status] ?? -1;
}

function parseTimestamp(value) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Given two job records (from index and from file), return the authoritative
 * one and indicate which source needs patching.
 */
function reconcile(indexRecord, fileRecord) {
  if (!indexRecord && !fileRecord) return { job: null, patch: null };
  if (!indexRecord) return { job: fileRecord, patch: "index" };
  if (!fileRecord) return { job: indexRecord, patch: "file" };

  const indexRank = rankOf(indexRecord.status);
  const fileRank = rankOf(fileRecord.status);

  if (indexRank > fileRank) {
    return { job: indexRecord, patch: "file" };
  }
  if (fileRank > indexRank) {
    return { job: fileRecord, patch: "index" };
  }

  // Same rank — use the one with the later updatedAt/completedAt
  const indexTime = Math.max(
    parseTimestamp(indexRecord.updatedAt),
    parseTimestamp(indexRecord.completedAt)
  );
  const fileTime = Math.max(
    parseTimestamp(fileRecord.updatedAt),
    parseTimestamp(fileRecord.completedAt)
  );

  if (fileTime > indexTime) {
    return { job: fileRecord, patch: "index" };
  }
  // Default to index (it's the hot path for reads)
  return { job: indexRecord, patch: fileRank === indexRank ? null : "file" };
}

/**
 * Read a single job by ID, reconciling both stores.
 * Returns the authoritative job object, or null if not found in either store.
 */
export function resolveJobRecord(workspaceRoot, jobId) {
  // Read from index
  const allIndexJobs = listJobs(workspaceRoot);
  const indexRecord = allIndexJobs.find((j) => j.id === jobId) ?? null;

  // Read from file
  let fileRecord = null;
  const jobFile = resolveJobFile(workspaceRoot, jobId);
  if (fs.existsSync(jobFile)) {
    try {
      fileRecord = readJobFile(jobFile);
    } catch {
      fileRecord = null;
    }
  }

  const { job, patch } = reconcile(indexRecord, fileRecord);
  if (!job) return null;

  // Patch the out-of-sync source
  if (patch === "index") {
    upsertJob(workspaceRoot, {
      id: jobId,
      status: job.status,
      phase: job.phase,
      pid: job.pid ?? null,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      summary: job.summary
    });
  } else if (patch === "file") {
    writeJobFile(workspaceRoot, jobId, { ...fileRecord, ...job });
  }

  return job;
}

/**
 * Read all jobs, reconciling each against its file record.
 * Returns an array of authoritative job objects.
 */
export function resolveAllJobs(workspaceRoot) {
  const allIndexJobs = listJobs(workspaceRoot);
  const seenIds = new Set(allIndexJobs.map((j) => j.id));

  // Scan jobs/ dir for orphaned file-only records not in the index
  const probeFile = resolveJobFile(workspaceRoot, "__probe__");
  const jobsDirPath = probeFile.replace("__probe__.json", "");
  if (fs.existsSync(jobsDirPath)) {
    for (const entry of fs.readdirSync(jobsDirPath)) {
      if (!entry.endsWith(".json")) continue;
      const id = entry.replace(/\.json$/, "");
      if (id === "__probe__") continue;
      seenIds.add(id);
    }
  }

  const results = [];
  for (const id of seenIds) {
    const job = resolveJobRecord(workspaceRoot, id);
    if (job) results.push(job);
  }
  return results;
}
