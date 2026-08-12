# Changelog

## 1.0.8

- fix(Bug1): Detect zombie jobs — probes PID liveness for both `running` and `queued` states;
  three-state result (alive/dead/unknown): only `false` triggers zombie cleanup. Before marking
  failed, re-reads via unified layer to avoid overwriting a concurrently-completed job.
- fix(Bug2): `runCommandChecked` and `binaryAvailable` now explicitly pass `shell: false`,
  preventing the win32 default (`process.env.SHELL || true`) from mangling arguments in Git Bash.
- fix(Bug3): Unified job read layer (`lib/job-store.mjs`) reconciles `state.json` (index) and
  `jobs/<id>.json` (file) on every read. Information fields (`result`, `rendered`, `threadId`,
  `turnId`, `logFile`, `request`) are merged as a union; status fields follow the more-terminal
  record. Immutable fields (`threadId`, `turnId`, `request`) use JSON-serialized comparison to
  avoid false conflicts from independently-parsed objects. Terminal records have `pid` cleared
  on write-back. File-only orphans absorbed into the index carry `sessionId`, `jobClass`, and
  `workspaceRoot` to preserve session-filtering and candidate validation.
- fix(saveState): `.log` files are never deleted by `saveState`, `pruneJobs`, or SessionEnd
  cleanup — only `job JSON` files are removed. `saveState` accepts `{ removeJobIds }` for
  explicit targeted removal. SessionEnd uses `removeJobIds` to delete only the cleaned jobs'
  JSON files, avoiding `resolveAllJobs` resurrection (orphan revival bug).

## 1.0.7-sidebar.1

- Register persistent task and rescue threads as user threads so Codex Desktop lists them without
  changing their Claude Code originator.
- Keep review, adversarial review, transfer, and stop-gate threads out of the Codex Desktop task list.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
