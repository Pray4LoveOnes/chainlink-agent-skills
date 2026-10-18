# Chainlink Agent Authority Skill Evaluation

This suite checks bounded agent authority, evidence receipts, deterministic replay, and settlement reconciliation while preventing overlap with ordinary CRE and CRE Connect guidance.

## Deterministic verifier

Run from the repository root:

```bash
node --test \
  chainlink-agent-authority-skill/scripts/verify-execution-trace.test.mjs \
  evals/chainlink-agent-authority-skill/tests/*.test.mjs
```

This is the complete local deterministic suite. It covers unauthorized actions, expiry and revocation, nonce/intent replay, missing outbound authorization, denied business policy, ambiguous timeouts, scope mismatches, receipt/state tampering, duplicate and reordered delivery, injected signer identity, missing finality/execution evidence, negative routing, and shared prompt assembly. The verifier tests application trace invariants only; it does not cryptographically validate signatures or Chainlink/product proofs.

## Promptfoo

```bash
npx promptfoo validate -c evals/chainlink-agent-authority-skill/promptfooconfig.yaml
npx promptfoo eval -c evals/chainlink-agent-authority-skill/promptfooconfig.yaml --filter-metadata "smoke=true"
npx promptfoo eval -c evals/chainlink-agent-authority-skill/promptfooconfig.yaml
```

## Agent evaluation

```text
Run agent evals for chainlink-agent-authority-skill
```

## Coverage

- Five required functional scenarios: unauthorized action, expiry, replay, verified evidence without authorization, and unknown settlement.
- Two positive triggers for authority receipts and deterministic recovery.
- Four negative triggers for ordinary CRE, CRE Connect-only verification, generic OAuth, and generic ERC-4337.
- A deterministic Promptfoo guard against explicit unsafe authority and retry claims.
