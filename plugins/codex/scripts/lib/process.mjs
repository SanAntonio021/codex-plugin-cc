import { spawnSync } from "node:child_process";
import process from "node:process";

export function runCommand(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    maxBuffer: options.maxBuffer,
    stdio: options.stdio ?? "pipe",
    shell: options.shell ?? (process.platform === "win32" ? (process.env.SHELL || true) : false),
    windowsHide: true
  });

  return {
    command,
    args,
    status: result.status ?? 0,
    signal: result.signal ?? null,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error ?? null
  };
}

export function runCommandChecked(command, args = [], options = {}) {
  const result = runCommand(command, args, { ...options, shell: false });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(formatCommandFailure(result));
  }
  return result;
}

export function binaryAvailable(command, versionArgs = ["--version"], options = {}) {
  const result = runCommand(command, versionArgs, options);
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ENOENT") {
    return { available: false, detail: "not found" };
  }
  if (result.error) {
    return { available: false, detail: result.error.message };
  }
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.status}`;
    return { available: false, detail };
  }
  return { available: true, detail: result.stdout.trim() || result.stderr.trim() || "ok" };
}

function looksLikeMissingProcessMessage(text) {
  return /not found|no running instance|cannot find|does not exist|no such process/i.test(text);
}

export function terminateProcessTree(pid, options = {}) {
  if (!Number.isFinite(pid)) {
    return { attempted: false, delivered: false, method: null };
  }

  const platform = options.platform ?? process.platform;
  const runCommandImpl = options.runCommandImpl ?? runCommand;
  const killImpl = options.killImpl ?? process.kill.bind(process);
  const isProcessAliveImpl = options.isProcessAliveImpl ?? ((candidatePid) => isProcessAlive(candidatePid, { platform }));

  if (platform === "win32") {
    const result = runCommandImpl("taskkill", ["/PID", String(pid), "/T", "/F"], {
      cwd: options.cwd,
      env: options.env,
      shell: false
    });

    if (!result.error && result.status === 0) {
      return { attempted: true, delivered: true, method: "taskkill", result };
    }

    const combinedOutput = `${result.stderr}\n${result.stdout}`.trim();
    if (!result.error && looksLikeMissingProcessMessage(combinedOutput)) {
      return { attempted: true, delivered: false, method: "taskkill", result };
    }

    if (result.error?.code === "ENOENT") {
      try {
        killImpl(pid);
        return { attempted: true, delivered: true, method: "kill" };
      } catch (error) {
        if (error?.code === "ESRCH") {
          return { attempted: true, delivered: false, method: "kill" };
        }
        throw error;
      }
    }

    if (result.error) {
      throw result.error;
    }

    // taskkill can report a partial-tree failure after the root worker has
    // already exited. Treat that race as cleanup complete; only surface the
    // error when the recorded root PID is still alive or cannot be checked.
    const rootAlive = isProcessAliveImpl(pid);
    if (rootAlive === false) {
      return { attempted: true, delivered: false, method: "taskkill", result };
    }

    throw new Error(formatCommandFailure(result));
  }

  try {
    killImpl(-pid, "SIGTERM");
    return { attempted: true, delivered: true, method: "process-group" };
  } catch (error) {
    if (error?.code !== "ESRCH") {
      try {
        killImpl(pid, "SIGTERM");
        return { attempted: true, delivered: true, method: "process" };
      } catch (innerError) {
        if (innerError?.code === "ESRCH") {
          return { attempted: true, delivered: false, method: "process" };
        }
        throw innerError;
      }
    }

    return { attempted: true, delivered: false, method: "process-group" };
  }
}

export function formatCommandFailure(result) {
  const parts = [`${result.command} ${result.args.join(" ")}`.trim()];
  if (result.signal) {
    parts.push(`signal=${result.signal}`);
  } else {
    parts.push(`exit=${result.status}`);
  }
  const stderr = (result.stderr || "").trim();
  const stdout = (result.stdout || "").trim();
  if (stderr) {
    parts.push(stderr);
  } else if (stdout) {
    parts.push(stdout);
  }
  return parts.join(": ");
}

/**
 * Check whether a process with the given PID is still alive.
 * Returns: true (alive), false (dead), or "unknown" (cannot determine).
 *
 * - Unix: process.kill(pid, 0) — ESRCH means dead, EPERM means alive.
 * - Windows: tasklist /FI "PID eq <pid>" with shell:false to avoid Git Bash path mangling.
 */
export function isProcessAlive(pid, options = {}) {
  if (!Number.isFinite(pid)) {
    return false;
  }

  const platform = options.platform ?? process.platform;
  const runCommandImpl = options.runCommandImpl ?? runCommand;

  if (platform === "win32") {
    // Use /FO CSV for locale-independent output.  The data lines are formatted
    // as:  "ImageName","PID","SessionName","Session#","MemUsage"
    // When no process matches, tasklist emits a non-CSV info/warning line.
    const result = runCommandImpl("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"], {
      shell: false
    });
    if (result.error) {
      return "unknown";
    }
    // Non-zero exit means the filter was invalid or access was denied — unknown.
    if (result.status !== 0) {
      return "unknown";
    }
    const pidStr = String(pid);
    for (const line of result.stdout.split(/\r?\n/)) {
      // CSV line: each field is quoted, PID is the second field.
      const m = line.match(/^"[^"]*","(\d+)"/);
      if (m && m[1] === pidStr) {
        return true;
      }
    }
    // No CSV row matched our PID — process is not running.
    return false;
  }

  // Unix: signal 0 probes without killing
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") {
      return false; // No such process
    }
    if (error?.code === "EPERM") {
      return true; // Process exists but we lack permission
    }
    return "unknown";
  }
}
