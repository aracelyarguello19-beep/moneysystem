"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  invoke,
  buildClaudeCliArgs,
  extractDesignMdFromCliStdout,
  isNestedClaudeCodeSession,
} = require("./claude-cli.cjs");

test("claude-cli invoke is a function", () => {
  assert.equal(typeof invoke, "function");
});

test("claude-cli invoke accepts options with maxTurns", () => {
  // Validates interface only — cannot spawn real claude binary in unit tests
  assert.doesNotThrow(() => {
    assert.equal(typeof invoke, "function");
    // confirm it accepts the expected signature
    const sig = invoke.length;
    // promptText + options = 2 params (options optional)
    assert.ok(sig >= 1);
  });
});

test("claude-cli passes explicit model to CLI args", () => {
  const args = buildClaudeCliArgs("prompt", {
    maxTurns: 7,
    model: "claude-haiku-4-5",
  });

  assert.deepEqual(args.slice(0, 2), ["-p", "prompt"]);
  assert.equal(args[args.indexOf("--max-turns") + 1], "7");
  assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-4-5");
});

test("claude-cli omits --model when caller did not request one", () => {
  const args = buildClaudeCliArgs("prompt", { maxTurns: 7 });
  assert.equal(args.includes("--model"), false);
});

test("claude-cli detects nested Claude Code sessions", () => {
  assert.equal(isNestedClaudeCodeSession({ CLAUDE_CODE_SESSION_ID: "abc" }), true);
  assert.equal(isNestedClaudeCodeSession({ CLAUDE_CODE_SESSION_ID: "abc", DESIGN_MD_ALLOW_NESTED_CLAUDE: "1" }), false);
  assert.equal(isNestedClaudeCodeSession({}), false);
});

test("claude-cli stdout extraction ignores result text without DESIGN frontmatter", () => {
  const stdout = `${JSON.stringify({
    type: "result",
    result: "API Error: Stream idle timeout - partial response received",
  })}\n`;

  assert.equal(extractDesignMdFromCliStdout(stdout), "");
});

test("claude-cli stdout extraction strips preface before DESIGN frontmatter", () => {
  const designMd = "---\nname: Example\n---\n\n## 1. Visual Theme\n";
  const stdout = [
    JSON.stringify({ type: "assistant", message: "working" }),
    JSON.stringify({ type: "result", result: `Here is the file:\n${designMd}` }),
  ].join("\n");

  assert.equal(extractDesignMdFromCliStdout(stdout), designMd);
});
