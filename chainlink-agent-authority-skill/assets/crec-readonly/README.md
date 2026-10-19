# Provisioned CRE Connect read-only boundary

This application-owned Go example uses the documented SDK v0.8.0. It polls one page and locally verifies `watcher.event` envelopes. It neither constructs a signed Operation nor calls a settlement provider. See [API compatibility](../../references/api-compatibility.md).

## Independent checks

Go 1.25.3 or later is required. The configuration tests need only the standard library and never call the network:

```sh
cd chainlink-agent-authority-skill/assets/crec-readonly
GOTOOLCHAIN=local GOPROXY=off go test -count=1 -v config.go config_test.go
gofmt -l config.go config_test.go main.go
```

SDK compilation is a separate check. With permitted module-download access:

```sh
go mod tidy
go test ./...
go build -o /tmp/agent-authority-crec-readonly .
```

Review and retain the generated `go.sum` in your deployment repository. It is not fabricated here. The release qualification distinguishes configuration tests from a successful SDK build. The checked-in `go.mod` pins v0.8.0; this example has not been authenticated against a provisioned tenant.

## Provisioning and configuration

Use deployment-managed values, never fields supplied by an event or claimant:

| Variable | Required source |
| --- | --- |
| `CREC_BASE_URL` | Approved HTTPS service endpoint for the provisioned environment |
| `CREC_API_KEY` | Secret manager; never paste into a command, source file, or issue |
| `CREC_ORG_ID` | Provisioned organization whose workflow owner must match |
| `CREC_CHANNEL_ID` | Application-approved existing channel |
| `CREC_DON_TENANT_ID` | Provisioned CRE tenant, distinct from organization ID |
| `CREC_DON_THRESHOLD` | Provisioned DON quorum threshold, not an arbitrary confidence number |
| `CREC_DON_SIGNERS` | Comma-separated current DON addresses from trusted onboarding/configuration |
| `CREC_ENABLE_AUTHENTICATED_READ` | Explicitly set to `1` only after approving the authenticated read |

Run the built binary after your deployment system supplies these values. There is no credential-printing helper. Signer configuration is validated for shape and uniqueness, but only your independently verified onboarding record establishes that those signers are correct. Public documentation does not grant service access. [Provisioning prerequisites](https://docs.chain.link/crec/getting-started/prerequisites)

## Output is not a fulfillment capability

The output schema `app.crec.readonly-observation/v1` is deliberately different from the offline conformance receipt bundle. Its digest is SHA-256 of Go's serialized event envelope, not the receipt canonicalization format or the DON report hash. It is an unsigned local diagnostic; downstream software must not trust it as a portable proof.

Every emitted record states `finality`, action/chain binding, and business authorization are `NOT_EVALUATED`, and sets `irreversibleFulfillmentAllowed` to `false`. Before any production action an application must decode and independently scope-check the verified payload, establish chain-specific finality, compare the exact authorized intent, recheck revocation, obtain explicit approval, and durably reserve its idempotency key. This example intentionally stops before those gates. It does not invent a mapping from a DON event to an arbitrary business intent.

Polling does not automatically verify events or advance a durable cursor. This single-page probe persists no offsets, drops no checkpoint, and may emit duplicate diagnostics on rerun. A temporarily missing proof ends the run so it can be re-polled; other verification failures fail closed. A production ingestion worker needs a durable inbox and contiguous checkpoint policy that cannot skip pending or rejected records. [Polling semantics](https://docs.chain.link/crec/guides/events/poll-and-search)

No output or adapter from this example enters the Sovereign Bridge. The offline simulator imports no Go SDK and uses only explicitly synthetic observations.
