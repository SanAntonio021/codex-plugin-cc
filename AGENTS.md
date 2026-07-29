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
