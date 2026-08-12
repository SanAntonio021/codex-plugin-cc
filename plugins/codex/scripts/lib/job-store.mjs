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
 * Fields that carry information and should be merged as a union (whichever
 * side has a non-null/undefined value wins, regardless of which source "won"
 * on status).  Immutable fields are checked separately for conflicts.
 */
const IMMUTABLE_FIELDS = ["threadId", "turnId", "request"];
const INFORMATION_FIELDS = ["result", "rendered", "logFile", "threadId", "turnId", "request"];

/**
 * Merge two job records: status fields come from the "winner" (the record
 * with the more-terminal or more-recent status), information fields are
 * merged as a union so that data present on only one side is not lost.
 *
 * Throws if immutable fields are non-null on both sides but disagree —
 * that means the two records are not the same job.
 *
 * Returns { job, patch } where patch indicates which source needs updating,
 * or null if both are already in sync.
 */
function reconcile(indexRecord, fileRecord) {
  if (!indexRecord && !fileRecord) return { job: null, patch: null };
  if (!indexRecord) return { job: fileRecord, patch: "index" };
  if (!fileRecord) return { job: indexRecord, patch: "file" };

  const indexRank = rankOf(indexRecord.status);
  const fileRank = rankOf(fileRecord.status);

  // Determine which record wins on status.
  let winner, loser, patchTarget;
  if (indexRank > fileRank) {
    winner = indexRecord;
    loser = fileRecord;
    patchTarget = "file";
  } else if (fileRank > indexRank) {
    winner = fileRecord;
    loser = indexRecord;
    patchTarget = "index";
  } else {
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
      winner = fileRecord;
      loser = indexRecord;
      patchTarget = "index";
    } else {
      winner = indexRecord;
      loser = fileRecord;
      // When index wins on time (or is the default), we still need to patch the
      // file if their status/phase actually differ — otherwise the stale value
      // in the file persists forever.  Start with null and promote below.
      patchTarget = indexRecord.status !== fileRecord.status ||
        indexRecord.phase !== fileRecord.phase
        ? "file"
        : null;
    }
  }

  // Check immutable fields for conflicts.
  // Use JSON-serialized comparison for object fields (e.g. `request`) because
  // two independently-parsed copies of the same JSON are never === even when
  // their contents are identical.
  for (const field of IMMUTABLE_FIELDS) {
    const wv = winner[field];
    const lv = loser[field];
    if (wv != null && lv != null) {
      const wStr = typeof wv === "object" ? JSON.stringify(wv) : String(wv);
      const lStr = typeof lv === "object" ? JSON.stringify(lv) : String(lv);
      if (wStr !== lStr) {
        throw new Error(
          `Job store conflict: immutable field "${field}" differs between index and file for job "${winner.id ?? loser.id}". ` +
            `index=${JSON.stringify(indexRecord[field])}, file=${JSON.stringify(fileRecord[field])}`
        );
      }
    }
  }

  // Build merged record: start from winner, fill in information fields from
  // loser wherever winner has no value.
  let merged = { ...winner };
  let needsPatch = patchTarget !== null;
  for (const field of INFORMATION_FIELDS) {
    if (merged[field] == null && loser[field] != null) {
      merged[field] = loser[field];
      needsPatch = true; // winner source is missing this — patch it
    }
  }

  // Determine final patch target after merge.
  // If we merged extra fields from the loser into the winner, both sources
  // need updating: the winner source gains the extra fields, and the loser
  // source already had them.  We only need to write back to the winner source.
  const finalPatch = needsPatch ? patchTarget ?? (winner === indexRecord ? "index" : "file") : null;

  return { job: merged, patch: finalPatch };
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

  // Patch the out-of-sync source with the full merged record.
  if (patch === "index") {
    // When a file-only orphan is absorbed into the index, include all fields
    // that the index normally tracks (sessionId, jobClass, workspaceRoot, etc.)
    // so that session-filtering and candidate validation work correctly.
    // Also enforce pid=null on terminal records to prevent stale PIDs.
    const isTerminal = job.status === "completed" || job.status === "failed" || job.status === "cancelled";
    upsertJob(workspaceRoot, {
      id: job.id,
      status: job.status,
      phase: job.phase,
      pid: isTerminal ? null : (job.pid ?? null),
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
      summary: job.summary,
      // carry over fields needed for session/class filtering
      sessionId: job.sessionId ?? null,
      jobClass: job.jobClass ?? null,
      workspaceRoot: job.workspaceRoot ?? workspaceRoot,
      // information fields that may have been filled in from the file
      result: job.result ?? null,
      rendered: job.rendered ?? null,
      threadId: job.threadId ?? null,
      turnId: job.turnId ?? null,
      logFile: job.logFile ?? null
    });
  } else if (patch === "file") {
    // Enforce pid=null on terminal records written back to the file too.
    const isTerminal = job.status === "completed" || job.status === "failed" || job.status === "cancelled";
    writeJobFile(workspaceRoot, jobId, isTerminal ? { ...job, pid: null } : job);
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
