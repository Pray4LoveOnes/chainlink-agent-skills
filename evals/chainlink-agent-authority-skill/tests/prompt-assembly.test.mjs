import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Module from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const evalDir = path.resolve(here, "..");
const repositoryRoot = path.resolve(evalDir, "..", "..");
const helperPath = path.join(repositoryRoot, "evals", "shared", "with-skill-prompt.js");

async function loadCommonJs(filename) {
  const source = await readFile(filename, "utf8");
  const loaded = new Module(filename);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(source, filename);
  return loaded.exports;
}

const withSkillPrompt = await loadCommonJs(helperPath);
const cases = [
  ["cases/functional/unauthorized-tool-action-01.txt", ["references/bounded-authority.md", "references/execution-receipts.md"]],
  ["cases/functional/expired-authorization-01.txt", ["references/bounded-authority.md", "references/execution-receipts.md"]],
  ["cases/functional/replayed-intent-01.txt", ["references/bounded-authority.md", "references/deterministic-replay.md"]],
  ["cases/functional/verified-event-no-authorization-01.txt", ["references/bounded-authority.md", "references/execution-receipts.md"]],
  ["cases/functional/unknown-settlement-01.txt", ["references/settlement-reconciliation.md", "references/deterministic-replay.md"]],
  ["cases/trigger-positive/authority-receipt-01.txt", ["references/bounded-authority.md", "references/execution-receipts.md"]],
  ["cases/trigger-positive/deterministic-replay-01.txt", ["references/deterministic-replay.md", "references/settlement-reconciliation.md"]],
  ["cases/trigger-negative/ordinary-cre-workflow-01.txt", []],
  ["cases/trigger-negative/cre-connect-event-01.txt", []],
  ["cases/trigger-negative/generic-oauth-01.txt", []],
  ["cases/trigger-negative/generic-erc4337-01.txt", []],
];

for (const [caseFile, referenceFiles] of cases) {
  test(`assembles ${caseFile} through the shared prompt loader`, () => {
    const prompt = withSkillPrompt({
      skillId: "chainlink-agent-authority-skill",
      evalDir,
      vars: { case_file: caseFile, reference_files: referenceFiles },
    });
    assert.equal(prompt.length, 2);
    assert.equal(prompt[0].role, "system");
    assert.equal(prompt[1].role, "user");
    assert.match(prompt[0].content, /# Chainlink Agent Authority Skill/);
    assert.ok(prompt[1].content.length > 20);
    for (const reference of referenceFiles) assert.match(prompt[0].content, new RegExp(`# Reference: ${reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  });
}

test("shared prompt loader rejects a reference path outside the skill", () => {
  assert.throws(() => withSkillPrompt({
    skillId: "chainlink-agent-authority-skill",
    evalDir,
    vars: { case_file: cases[0][0], reference_files: ["../README.md"] },
  }), /escapes the skill root/);
});
