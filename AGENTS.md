# Local Maintenance Rules

This repository is a local maintenance fork of `openai/codex-plugin-cc`.

- Keep the marketplace name `openai-codex` and the plugin name `codex`; resume validation depends on this plugin ID.
- Preserve visible Codex Desktop registration only for persistent `task` and `rescue` threads.
- Do not add `threadSource` to review, adversarial review, transfer, or stop-gate threads.
- Never edit Claude's installed plugin cache directly. Change this source, test it, then reinstall or update the marketplace plugin.
- Run focused runtime tests, `npm run check-version`, and `claude plugin validate .` before deployment.
- Keep the upstream remote pointed at `https://github.com/openai/codex-plugin-cc` for comparison only. Do not push local patches there.
