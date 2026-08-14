# Local Maintenance Rules

This repository is a local maintenance fork of `openai/codex-plugin-cc`.

- Keep the marketplace name `openai-codex` and the plugin name `codex`; resume validation depends on this plugin ID.
- Preserve visible Codex Desktop registration only for persistent `task` and `rescue` threads.
- Do not add `threadSource` to review, adversarial review, transfer, or stop-gate threads.
- Never edit Claude's installed plugin cache directly. Change this source, test it, then reinstall or update the marketplace plugin.
- Run focused runtime tests, `npm run check-version`, and `claude plugin validate .` before deployment.
- Keep the upstream remote pointed at `https://github.com/openai/codex-plugin-cc` for comparison only. Do not push local patches there.
- Use a separate `fork` remote for personal GitHub branches and upstream pull requests.
- Prepare upstream contributions in an isolated worktree from `origin/main`. Keep the PR limited to portable runtime and test changes; leave local version metadata, marketplace source, permission settings, sync markers, and fork-only documentation out of the PR.
- On Windows, if `npm run build` stops at its POSIX `mkdir -p` wrapper, run the equivalent app-server type generation and TypeScript compilation directly, then report the wrapper limitation.

## Release verification

- Treat the source checkout as authoritative. Update the plugin through the Claude CLI after
  validation; never edit `~/.claude/plugins/cache` directly.
- Before deployment, run the focused runtime tests, `npm run build`, `npm run check-version`, and
  `claude plugin validate .`. Use fake app-server fixtures for permission and protocol checks; do
  not start a real Codex task only to smoke-test an installation.
- After installation or update, use `claude plugin list --json` and `claude plugin details` to
  confirm every expected user/project record is enabled and points to the same release.
- Restart active Claude Code worker processes after an update while leaving the VS Code host
  running. Confirm no app-server broker still runs from an older cache version before continuing.
- Older version directories may remain in the Claude cache as rollback material. They are not
  active installations or formal archives; the plugin registry is the authority for what is
  enabled. Do not remove or reuse them without an explicit cleanup or rollback decision.
