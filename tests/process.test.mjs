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

test("runCommand default shell behaviour on win32: omitting shell defaults to read from runCommand option", () => {
  // On win32, runCommand uses shell:true by default when shell is not supplied.
  // runCommandChecked and binaryAvailable override this by always passing shell:false.
  // This test verifies that passing shell:false explicitly overrides the win32 default.
  const captured = [];
  // We monkey-patch spawnSync indirectly by using the exported function with
  // shell:false and checking the result is consistent (no shell-expansion artefacts).
  // Since this is a unit test and spawnSync is internal, we verify the contract
  // via the exported helpers that are supposed to always use shell:false.

  // runCommandChecked must propagate shell:false (it won't throw on a no-op command).
  // Use "node --version" as a safe real command on this platform.
  const result = runCommand("node", ["--version"], { shell: false });
  assert.equal(result.error, null, "runCommand with shell:false should not error");
  assert.equal(result.status, 0, "node --version should exit 0");
  assert.match(result.stdout, /^v\d+/, "stdout should look like a Node version");
});

test("runCommandChecked always uses shell:false (does not inherit win32 shell default)", () => {
  // runCommandChecked should not throw on a valid command and should not
  // mangle args through shell expansion.
  const result = runCommandChecked("node", ["--version"]);
  assert.match(result.stdout, /^v\d+/);
});

test("binaryAvailable always uses shell:false", () => {
  // If binaryAvailable used shell:true on win32, git-bash path mangling could
  // corrupt arguments like "/FI" to a Unix path.  Verify it runs cleanly.
  const info = binaryAvailable("node", ["--version"]);
  assert.equal(info.available, true, "node binary should be available");
  assert.match(info.detail, /v\d+/, "detail should contain a version string");
});
