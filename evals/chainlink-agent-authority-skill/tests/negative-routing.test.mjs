/** Documentation routing checks keep this skill away from unrelated products. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const evalDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skill = await readFile(path.resolve(evalDir, "..", "..", "chainlink-agent-authority-skill", "SKILL.md"), "utf8");

test("ordinary CRE workflow requests are explicitly routed away", async () => {
  const prompt = await readFile(path.join(evalDir, "cases/trigger-negative/ordinary-cre-workflow-01.txt"), "utf8");
  assert.match(prompt, /ordinary workflow development/i);
  assert.match(skill, /relevant Chainlink product skill for product mechanics/i);
});

test("CRE Connect-only verification remains a product-skill request", async () => {
  const prompt = await readFile(path.join(evalDir, "cases/trigger-negative/cre-connect-event-01.txt"), "utf8");
  assert.match(prompt, /only need CRE Connect product guidance/i);
  assert.match(skill, /Use the relevant Chainlink product skill/i);
});

test("generic OAuth does not activate agent authority guidance", async () => {
  const prompt = await readFile(path.join(evalDir, "cases/trigger-negative/generic-oauth-01.txt"), "utf8");
  assert.match(prompt, /does not use Chainlink or autonomous agents/i);
  assert.match(skill, /not a Chainlink product/i);
});

test("generic account abstraction does not activate agent authority guidance", async () => {
  const prompt = await readFile(path.join(evalDir, "cases/trigger-negative/generic-erc4337-01.txt"), "utf8");
  assert.match(prompt, /does not use Chainlink/i);
  assert.match(skill, /generic ERC-4337/);
});
