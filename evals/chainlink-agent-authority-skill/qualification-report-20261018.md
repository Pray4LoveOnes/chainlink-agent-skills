# Qualification report — 2026-10-18

This report records the local run on the `feat/agent-authority-conformance` branch. It is not a production certification.

## Confirmed runs

| Command | Result |
| --- | --- |
| `node --test chainlink-agent-authority-skill/scripts/verify-execution-trace.test.mjs evals/chainlink-agent-authority-skill/tests/*.mjs` | PASS — 80 tests, 0 failures |
| `node chainlink-agent-authority-skill/scripts/conformance/scenario.mjs <temporary directory>` | PASS — `FULFILLED`, one synthetic effect, one provider attempt, no live actions |
| `node chainlink-agent-authority-skill/scripts/conformance/verify-bundle.mjs bundle.json trust.json 1800000000` | PASS — valid bundle; `irreversibleFulfillmentAllowed:false` |
| `node chainlink-agent-authority-skill/scripts/conformance/benchmark.mjs --intents 10000 --workers 4` | PASS — measured below |
| `cd chainlink-agent-authority-skill/assets/crec-readonly && GOCACHE=/tmp/agent-authority-go-cache GOTOOLCHAIN=local GOPROXY=off go test -count=1 -v config.go config_test.go` | PASS — configuration boundary tests |
| `ruby -e '...Psych.safe_load(promptfooconfig.yaml)...'` | PASS — authority YAML parsed |
| `ruby -c .github/scripts/validate-promptfoo-configs.rb` | PASS |
| `node --check` on conformance and prompt scripts | PASS |
| `git diff --check` | PASS |

## Measured synthetic benchmark

One local run with Node v25.8.2 reported:

```json
{"benchmark":"synthetic-agent-intents/v1","intents":10000,"workers":4,"concurrency":4,"elapsedMs":118.06,"throughputPerSecond":84702.972,"accepted":9492,"rejected":271,"duplicateSettlementAttempts":237,"memoryBytesStart":37588992,"memoryBytesEnd":90738688,"memoryBytesDelta":53149696,"hostParallelism":12,"hostTotalMemoryBytes":17179869184,"syntheticOnly":true}
```

The worker benchmark hashes synthetic intents and counts deterministic policy rejects and duplicate settlement attempts. It does not use the Agent City shard engine, Chainlink services, a chain, credentials, or real assets. Values vary by host and run; no performance claim is implied.

## Not run / unknown

- Promptfoo model-backed evaluation: **NOT RUN**; no local `promptfoo` executable/provider qualification was available.
- CRE Connect authenticated SDK build and live event verification: **NOT RUN**; it requires the provisioned tenant, credentials, current DON configuration, and module download access. Standard-library configuration tests passed.
- `git fetch upstream main`: **UNKNOWN/UNAVAILABLE** in this environment because DNS could not resolve `github.com`; branch base is the cached `upstream/main` at `4c720df5e79b62ef251dd6288f7ba3691524a9bc`.
- Production deployment, settlement, chain finality, and legal entitlement: **UNKNOWN** and intentionally outside this package.

The separate Go example uses only documented v0.8.0 read/verify methods, emits no fulfillment authorization, and never enters the native-only Sovereign Bridge path.
