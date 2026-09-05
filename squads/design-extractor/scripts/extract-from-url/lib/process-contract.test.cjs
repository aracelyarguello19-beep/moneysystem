"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  loadProcessContract,
  renderProcessContractForPrompt,
  validateProcessContract,
} = require("./process-contract.cjs");

test("process contract loads the no-fallback and DESIGN.md rules as data", () => {
  const contract = loadProcessContract();

  assert.equal(contract.contract_id, "design-md-url-extraction-process");
  assert.deepEqual(
    contract.source_rules.map((rule) => rule.path),
    [
      ".claude/rules/extraction-no-fallbacks.md",
      "squads/design-ops/rules/design-md-convention.md",
    ],
  );
  assert.equal(contract.no_fallbacks.missing_value.gap_marker_format, "extraction_gap(<reason>)");
  assert.ok(contract.design_md.frontmatter.required_keys.includes("components"));
  assert.ok(contract.design_md.canonical_sections.includes("## 9. Agent Prompt Guide"));
});

test("process contract renders into prompt instructions", () => {
  const rendered = renderProcessContractForPrompt(loadProcessContract());

  assert.match(rendered, /Loaded Process Contract/);
  assert.match(rendered, /No-Fallback Doctrine/);
  assert.match(rendered, /Universal token defaults/);
  assert.match(rendered, /## Implementation is required/);
  assert.match(rendered, /## 9\. Agent Prompt Guide is required/);
  assert.match(rendered, /Fidelity Notes/);
});

test("process contract validation rejects incomplete data", () => {
  assert.throws(
    () => validateProcessContract({ contract_id: "broken" }),
    /Invalid process contract/,
  );
});
