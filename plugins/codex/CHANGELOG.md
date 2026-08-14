# Changelog

## 1.0.10

- Fix the Windows `npm run build` entry point. The prebuild step now creates the generated type
  directory through Node instead of the POSIX-only `mkdir -p` command, then runs the same Codex
  app-server type generation on every supported platform.
- Remove the obsolete `workspaceRoot` property from `thread/start`; current app-server protocol
  types accept `cwd` but reject that extra property.

## 1.0.9

- **Breaking change:** `task` now defaults to `danger-full-access`, including paths outside the
  current workspace. `--read-only` is the explicit downgrade flag; `--write` remains a compatible
  alias for the default.
- Foreground, background, and resumed tasks use one persisted sandbox value. Queued jobs created
  before this release keep their original `workspace-write` or `read-only` behavior from `write`.
- Review, adversarial-review, and stop-gate paths remain hard-coded `read-only`; transfer does not
  run a task turn.
- Setup probes the native Node executable without shell expansion, so minimal Windows `PATH`
  environments no longer report a false not-ready state.
- Windows task cancellation tolerates a partial `taskkill` result when the recorded root worker has
  already exited, while still surfacing failures when the root process remains alive.
- Transfer regression fixtures now inject the Windows user profile explicitly, exercising native
  import error handling without weakening the Claude projects directory allowlist.

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
