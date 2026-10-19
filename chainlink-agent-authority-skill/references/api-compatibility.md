# API compatibility and ownership

Documentation reviewed 2026-10-18. Compatibility target: core Go SDK `github.com/smartcontractkit/crec-sdk` v0.8.0, not a claimed live deployment. The public release notes identify v0.8.0 and its atomic DON-configuration option; service use still requires provisioning. [Release notes](https://docs.chain.link/crec/release-notes)

| Surface | Public documented interface | Contribution behavior | Qualification boundary |
| --- | --- | --- | --- |
| SDK initialization | `crec.NewClient(baseURL, apiKey, opts...)` | Explicit provisioned values; no implicit credentials | Source matches docs; compiled/live status is recorded separately |
| Owner binding | `crec.WithOrgID(orgID)` | Organization selected by deployment, never by claim | Correct organization must be independently established |
| DON verification configuration | `crec.WithDONConfig(creTenantID, threshold, signers)` | All three values required; duplicate addresses rejected | Correct current keys/quorum require trusted onboarding configuration |
| Authenticated transport | `crec.WithHTTPClient`, `crec.WithLogger` | HTTPS, timeout, no redirects; SDK logging suppressed | No authenticated request is made by offline tests |
| Event ingestion | `client.Events.Poll(ctx, channelID, nil)` | One read-only page; no automatic cursor advance | Not a complete production ingestion daemon |
| Local watcher verification | `client.Events.Verify(&event)` | Reject `false` and errors; special missing-proof retry classification | Does not confer business authority or finality |
| Missing proof | `events.ErrNoOCRProofs` | Stop without checkpoint advancement and re-poll | No other failure is silently treated as proof lag |
| Other event families | `VerifyOperationStatus`, `VerifyQueryStatus` | Documented but not used by this watcher-only example | Never run watcher verification and treat another family as verified |
| Receipt signatures and durable ledger | Application-defined Node code | Synthetic signer/observer identities and SQLite records | Not DON signature verification, a Chainlink SDK, or a service adapter |

The option signatures come from [SDK configuration](https://docs.chain.link/crec/reference/sdk-configuration); event methods and errors from [event verification](https://docs.chain.link/crec/guides/events/verify-signatures). Module/install details are published in [SDK installation](https://docs.chain.link/crec/getting-started/sdk-installation). Consequently, blanket statements that CRE Connect has no documented client methods are no longer appropriate for this version. Publicly documented APIs and permissioned service access are separate questions.

## What this does not duplicate

| Existing capability | Remains with Chainlink/product-specific skill | Added application control |
| --- | --- | --- |
| CRE Connect | DON/OCR evidence, Smart Accounts, EIP-712 operation handling | Principal provenance, bounded intent matching, revocation and effect recovery |
| Ordinary CRE | User-authored workflow code and runtime execution | Evidence/authority boundary around a consuming application |
| CCIP | Cross-chain transport and product-specific delivery verification | No transport implementation; explicit application finality/evidence requirements |
| x402 and agent wallets | Payment negotiation, protocol verification, wallet mechanics | Unknown-result reconciliation and scope-limited authorization patterns |
| ACE / confidential attestation | Product-specific policy/attestation verification | No replacement verifier; record its proven result and limitations |

The SDK also exposes operation submission, wallets, and queries; this example intentionally does not call them. [Go SDK reference](https://docs.chain.link/crec/reference/go-sdk) describes those interfaces. No new chain list, x402 protocol, agent wallet, relayer, proprietary Agent City runtime, or Sovereign Bridge connection is introduced.

## Required production qualification

Before adapting this example: compile the pinned SDK with verified module checksums; confirm the organization/channel/DON configuration and current network support; validate your specific event decoder and canonical field bindings; test finalized evidence and revocation under your actual provider; and obtain security review and explicit approval for any eventual irreversible action. Offline conformance success establishes none of these production prerequisites.
