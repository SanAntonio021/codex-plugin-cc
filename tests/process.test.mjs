import test from "node:test";
import assert from "node:assert/strict";

import { binaryAvailable, runCommand, runCommandChecked, terminateProcessTree } from "../plugins/codex/scripts/lib/process.mjs";

test("terminateProcessTree uses taskkill on Windows", () => {
  let captured = null;
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    runCommandImpl(command, args) {
      captured = { command, args };
      return {
        command,
        args,
        status: 0,
        signal: null,
        stdout: "",
        stderr: "",
        error: null
      };
    },
    killImpl() {
      throw new Error("kill fallback should not run");
    }
  });

  assert.deepEqual(captured, {
    command: "taskkill",
    args: ["/PID", "1234", "/T", "/F"]
  });
  assert.equal(outcome.delivered, true);
  assert.equal(outcome.method, "taskkill");
});

test("terminateProcessTree treats missing Windows processes as already stopped", () => {
  const outcome = terminateProcessTree(1234, {
    platform: "win32",
    runCommandImpl(command, args) {
      return {
        command,
        args,
        status: 128,
        signal: null,
        stdout: "ERROR: The process \"1234\" not found.",
        stderr: "",
        error: null
      };
    }
  });

  assert.equal(outcome.attempted, true);
  assert.equal(outcome.method, "taskkill");
  assert.equal(outcome.result.status, 128);
  assert.match(outcome.result.stdout, /not found/i);
});

test("runCommand respects explicit shell option over platform default", () => {
  // On win32, runCommand defaults to shell:true, but callers can override with shell:false.
  // This test verifies explicit shell:false is honored.
  const result = runCommand("node", ["--version"], { shell: false });
  assert.equal(result.error, null, "runCommand with shell:false should not error");
  assert.equal(result.status, 0, "node --version should exit 0");
  assert.match(result.stdout, /^v\d+/, "stdout should look like a Node version");
});

test("runCommandChecked inherits runCommand shell behavior", () => {
  // runCommandChecked does not override shell; it uses runCommand's default or caller option.
  const result = runCommandChecked("node", ["--version"]);
  assert.match(result.stdout, /^v\d+/);
});

test("binaryAvailable respects caller shell option and falls back to runCommand default", () => {
  // binaryAvailable no longer forces shell:false; it respects caller-supplied options
  // and falls back to runCommand's platform-specific default (shell:true on win32).
  // This allows .cmd wrappers to be found on Windows.
  const info = binaryAvailable("node", ["--version"]);
  assert.equal(info.available, true, "node binary should be available");
  assert.match(info.detail, /v\d+/, "detail should contain a version string");
});
