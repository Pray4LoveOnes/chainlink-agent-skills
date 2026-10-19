// This application-owned example authenticates a read and verifies watcher
// envelopes locally. It does not authorize, sign, submit, or fulfill anything.
package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	crec "github.com/smartcontractkit/crec-sdk"
	"github.com/smartcontractkit/crec-sdk/events"
)

type observation struct {
	Schema                         string `json:"schema"`
	Source                         string `json:"source"`
	EventID                        string `json:"eventId"`
	SerializedEnvelopeSHA256       string `json:"serializedEnvelopeSha256"`
	LocalOCRVerification           string `json:"localOCRVerification"`
	Finality                       string `json:"finality"`
	ActionAndChainBinding          string `json:"actionAndChainBinding"`
	BusinessAuthorization          string `json:"businessAuthorization"`
	IrreversibleFulfillmentAllowed bool   `json:"irreversibleFulfillmentAllowed"`
}

func run() error {
	c, err := loadConfig(os.Getenv)
	if err != nil {
		return err
	}
	// Do not forward an API key on redirects or print SDK error payloads.
	httpClient := &http.Client{
		Timeout: 20 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("redirect refused")
		},
	}
	client, err := crec.NewClient(c.baseURL, c.apiKey,
		crec.WithOrgID(c.orgID),
		crec.WithDONConfig(c.creTenantID, c.threshold, c.signers),
		crec.WithHTTPClient(httpClient),
		crec.WithLogger(slog.New(slog.NewTextHandler(io.Discard, nil))),
	)
	if err != nil {
		return errors.New("SDK initialization rejected configuration")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	polled, hasMore, err := client.Events.Poll(ctx, c.channelID, nil)
	if err != nil {
		return errors.New("authenticated poll failed; inspect redacted operational diagnostics")
	}
	encoder := json.NewEncoder(os.Stdout)
	for _, ev := range polled {
		// Verify is event-family aware and rejects non-watcher envelopes.
		ok, err := client.Events.Verify(&ev)
		if errors.Is(err, events.ErrOnlyWatcherEventsSupported) {
			continue
		}
		if errors.Is(err, events.ErrNoOCRProofs) {
			return errors.New("proof pending; re-poll without advancing a durable checkpoint")
		}
		if err != nil || !ok {
			return errors.New("event verification rejected; no downstream action authorized")
		}
		encoded, err := json.Marshal(ev)
		if err != nil {
			return errors.New("cannot encode verified envelope")
		}
		digest := sha256.Sum256(encoded)
		if err := encoder.Encode(observation{
			Schema: "app.crec.readonly-observation/v1", Source: "crec-sdk-v0.8.0",
			EventID: fmt.Sprint(ev.EventId), SerializedEnvelopeSHA256: hex.EncodeToString(digest[:]),
			LocalOCRVerification: "VERIFIED", Finality: "NOT_EVALUATED",
			ActionAndChainBinding: "NOT_EVALUATED", BusinessAuthorization: "NOT_EVALUATED",
			IrreversibleFulfillmentAllowed: false,
		}); err != nil {
			return errors.New("observation output failed")
		}
	}
	if hasMore {
		fmt.Fprintln(os.Stderr, "One page only; additional events exist. No checkpoint was advanced.")
	}
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
