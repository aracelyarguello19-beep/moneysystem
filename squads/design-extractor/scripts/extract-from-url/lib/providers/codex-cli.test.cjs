"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { invoke, buildCodexCliArgs, extractDesignMd } = require("./codex-cli.cjs");

test("codex-cli invoke is a function", () => {
  assert.equal(typeof invoke, "function");
});

test("codex-cli reads prompt from stdin and runs in workspace-write mode", () => {
  const args = buildCodexCliArgs({ cwd: "/repo" });

  assert.deepEqual(args.slice(0, 4), ["--sandbox", "workspace-write", "--ask-for-approval", "never"]);
  assert.equal(args.includes("exec"), true);
  assert.equal(args[args.indexOf("-C") + 1], "/repo");
  assert.equal(args.includes("--ephemeral"), true);
  assert.equal(args.at(-1), "-");
});

test("codex-cli passes explicit model to CLI args", () => {
  const args = buildCodexCliArgs({ cwd: "/repo", model: "gpt-5.5" });

  assert.equal(args[args.indexOf("-m") + 1], "gpt-5.5");
});

test("codex-cli can write final response to an output-last-message file", () => {
  const args = buildCodexCliArgs({ cwd: "/repo", outputLastMessage: "/tmp/last-message.txt" });

  assert.equal(args[args.indexOf("--output-last-message") + 1], "/tmp/last-message.txt");
});

test("codex-cli maps reasoning effort through config override", () => {
  const args = buildCodexCliArgs({ cwd: "/repo", reasoningEffort: "low" });

  assert.equal(args[args.indexOf("-c") + 1], 'model_reasoning_effort="low"');
});

test("codex-cli omits model when caller did not request one", () => {
  const args = buildCodexCliArgs({ cwd: "/repo" });
  assert.equal(args.includes("-m"), false);
});

test("codex-cli extracts inline DESIGN.md content from stdout", () => {
  const raw = "Done:\n---\nname: Test\n---\n\n## 1. Visual Theme & Atmosphere\n";
  const extracted = extractDesignMd(raw);

  assert.equal(extracted.startsWith("---\nname: Test"), true);
});
