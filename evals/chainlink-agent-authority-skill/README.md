# Agent authority conformance evaluation

This suite evaluates application-owned authorization and evidence boundaries. It does not replace CRE Connect, ordinary CRE, CCIP, x402, agent wallets, or protocol verifiers. The executable conformance package is the stronger qualification layer: it signs synthetic artifacts with ephemeral in-memory keys, verifies them against separately supplied trust, and uses SQLite only for an offline simulation.

Run the deterministic suite from the repository root:

```sh
node --test chainlink-agent-authority-skill/scripts/verify-execution-trace.test.mjs evals/chainlink-agent-authority-skill/tests/*.mjs
node chainlink-agent-authority-skill/scripts/conformance/benchmark.mjs --intents 10000 --workers 4
```

The benchmark prints measured elapsed time, throughput, worker concurrency, memory delta, rejected intents, and duplicate settlement attempts. It does not claim Agent City, Chainlink, blockchain, or production throughput.

The offline scenario writes a portable bundle and trust file:

```sh
node chainlink-agent-authority-skill/scripts/conformance/scenario.mjs /tmp/authority-demo
node chainlink-agent-authority-skill/scripts/conformance/verify-bundle.mjs /tmp/authority-demo/bundle.json /tmp/authority-demo/trust.json 1800000000
```

The verifier is a separate process and never authorizes an irreversible action. Canonical JSON, Ed25519 signatures, role/policy provenance, scope, finality, observed execution, state transitions, and receipt digests are checked. Current trust is supplied independently; historical verification is not fresh permission.

Promptfoo/model-backed evaluations are configured in `promptfooconfig.yaml` but are `NOT RUN` unless the required provider credentials and executable are available. The Go example under the skill is pinned to the documented CRE Connect SDK v0.8.0 and has separate standard-library configuration tests; its authenticated SDK build requires provisioned access and module availability.
