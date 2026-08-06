# Changelog

## 1.0.8

- fix(Bug1): Detect zombie jobs — when a worker process dies without updating state,
  `status` now probes the PID and marks the job as failed. Covers both `running` and
  stale `queued` states. Also auto-cleans zombies at task-creation time instead of blocking.
- fix(Bug2): `terminateProcessTree` now passes `shell: false` to `taskkill` on Windows,
  preventing Git Bash from mangling `/PID`, `/T`, `/F` arguments as Unix paths.
- fix(Bug3): Introduce unified job read layer (`lib/job-store.mjs`) with `resolveJobRecord`
  and `resolveAllJobs`. All callers (`status`, `result`, `cancel`, `resume-candidate`)
  now reconcile `state.json` (index) and `jobs/<id>.json` (file) on every read, patching
  the out-of-sync source to the more-terminal status.

## 1.0.7-sidebar.1

- Register persistent task and rescue threads as user threads so Codex Desktop lists them without
  changing their Claude Code originator.
- Keep review, adversarial review, transfer, and stop-gate threads out of the Codex Desktop task list.

## 1.0.0

- Initial version of the Codex plugin for Claude Code
