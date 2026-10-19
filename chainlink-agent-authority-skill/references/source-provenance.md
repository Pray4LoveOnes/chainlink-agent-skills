# Source provenance and adaptation boundary

The following Agent City paths were inspected as engineering-pattern sources. No runtime, private key, shard-agent engine, validator implementation, raw receipt, financial router, or bridge code is copied into this skill.

| Inspected source | Portable pattern used | Deliberate limit |
| --- | --- | --- |
| `/Users/owner/agent-city-e2e/agent-city-e2e/agentchain-appchain/internal/chain/state.go` and `internal/chain/types.go` | ordered nonce/state transitions, domain-separated state roots, crash-safe persistence | conformance package uses its own small state schema and SQLite; it is not an appchain |
| `agentchain-appchain/cmd/agentchain/main.go`, `scripts/e2e.sh` | replay/root comparison and explicit replay rejection | no Agent City transaction or validator code is imported |
| `cmd/agentcity-external-bind/main.go` | bind an intent to an external identity and finalized-head context | its inputs are claims; this package independently verifies only its synthetic provider evidence |
| `agentchain-chainlink-interface-hook-20260823/README.md`, `schema/agentchain-finality.schema.json` | narrow interface/commitment shape | preview schema is not treated as Chainlink proof or deployment contract |
| `solarakin-sovereign-vercel/src/lib/sovereign-city/receipt-selection.ts`, `authorization.ts`, `identity.ts`, `scope.ts` and their tests | deterministic evidence selection, issuer/audience/tenant scope, revocation and redaction | no Sovereign Bridge or native execution path is connected |
| `cmd/agentchain-evaluation-gateway/main.go`, `internal/evaluation/evaluation.go` and tests | configured policy, quota, kill-switch, revocation, and mainnet denial | no gateway service or credentials are bundled |
| `internal/mainnetpq/envelope_e2e_test.go`, `internal/mainnetpq/mainnetpq_test.go` | reviewed as a separate research qualification | no post-quantum or native Chainlink claim is made |

The public integration example is based only on the documented CRE Connect Go SDK v0.8.0 surface in [the compatibility matrix](api-compatibility.md). The offline conformance verifier and SDK example are separate: a synthetic signed observation cannot be relabeled as a DON proof, and a verified event cannot substitute for outbound business authorization or downstream execution evidence.
