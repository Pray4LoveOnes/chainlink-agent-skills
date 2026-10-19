package main

import (
	"encoding/hex"
	"errors"
	"net/url"
	"strconv"
	"strings"
)

// Deployment configuration is a trust boundary, never an event-payload field.
type config struct {
	baseURL, apiKey, orgID, channelID, creTenantID string
	threshold                                      int
	signers                                        []string
}

func loadConfig(getenv func(string) string) (config, error) {
	var c config
	if getenv("CREC_ENABLE_AUTHENTICATED_READ") != "1" {
		return c, errors.New("authenticated reads disabled; provisioning and explicit opt-in required")
	}
	c.baseURL = getenv("CREC_BASE_URL")
	c.apiKey = getenv("CREC_API_KEY")
	c.orgID = getenv("CREC_ORG_ID")
	c.channelID = getenv("CREC_CHANNEL_ID")
	c.creTenantID = getenv("CREC_DON_TENANT_ID")
	for _, v := range []string{c.apiKey, c.orgID, c.channelID, c.creTenantID} {
		if v == "" || strings.TrimSpace(v) != v || strings.ContainsAny(v, "\r\n\t ") {
			return config{}, errors.New("missing or malformed provisioned configuration")
		}
	}
	u, err := url.Parse(c.baseURL)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return config{}, errors.New("CREC_BASE_URL must be an approved HTTPS base URL without userinfo, query, or fragment")
	}
	c.threshold, err = strconv.Atoi(getenv("CREC_DON_THRESHOLD"))
	if err != nil || c.threshold <= 0 {
		return config{}, errors.New("positive provisioned DON threshold required")
	}
	seen := make(map[string]bool)
	for _, signer := range strings.Split(getenv("CREC_DON_SIGNERS"), ",") {
		signer = strings.ToLower(strings.TrimSpace(signer))
		if !strings.HasPrefix(signer, "0x") || len(signer) != 42 || signer == "0x"+strings.Repeat("0", 40) {
			return config{}, errors.New("invalid DON signer address")
		}
		if _, err := hex.DecodeString(signer[2:]); err != nil || seen[signer] {
			return config{}, errors.New("invalid or duplicate DON signer address")
		}
		seen[signer] = true
		c.signers = append(c.signers, signer)
	}
	if c.threshold > len(c.signers) {
		return config{}, errors.New("threshold exceeds distinct signer count")
	}
	return c, nil
}
