package main

import "testing"

func fixtureConfig() map[string]string {
	return map[string]string{
		"CREC_ENABLE_AUTHENTICATED_READ": "1", "CREC_BASE_URL": "https://crec.example.invalid/v1",
		"CREC_API_KEY": "synthetic-test-token", "CREC_ORG_ID": "org_synthetic",
		"CREC_CHANNEL_ID": "synthetic-channel", "CREC_DON_TENANT_ID": "3",
		"CREC_DON_THRESHOLD": "2",
		"CREC_DON_SIGNERS":   "0x1111111111111111111111111111111111111111,0x2222222222222222222222222222222222222222",
	}
}

func TestValidConfiguration(t *testing.T) {
	env := fixtureConfig()
	c, err := loadConfig(func(k string) string { return env[k] })
	if err != nil || c.threshold != 2 || len(c.signers) != 2 || c.orgID != "org_synthetic" {
		t.Fatal("valid synthetic configuration rejected")
	}
}

func TestRejectConfiguration(t *testing.T) {
	cases := []struct{ name, key, value string }{
		{"requires_opt_in", "CREC_ENABLE_AUTHENTICATED_READ", ""},
		{"missing_key", "CREC_API_KEY", ""},
		{"missing_owner", "CREC_ORG_ID", ""},
		{"missing_tenant", "CREC_DON_TENANT_ID", ""},
		{"missing_channel", "CREC_CHANNEL_ID", ""},
		{"cleartext", "CREC_BASE_URL", "http://crec.example.invalid/v1"},
		{"userinfo", "CREC_BASE_URL", "https://user@crec.example.invalid/v1"},
		{"query", "CREC_BASE_URL", "https://crec.example.invalid/v1?token=synthetic"},
		{"fragment", "CREC_BASE_URL", "https://crec.example.invalid/v1#fragment"},
		{"zero_threshold", "CREC_DON_THRESHOLD", "0"},
		{"excess_threshold", "CREC_DON_THRESHOLD", "3"},
		{"missing_signers", "CREC_DON_SIGNERS", ""},
		{"zero_address", "CREC_DON_SIGNERS", "0x0000000000000000000000000000000000000000"},
		{"invalid_address", "CREC_DON_SIGNERS", "0xnot-a-signer"},
		{"duplicate_signer", "CREC_DON_SIGNERS", "0x1111111111111111111111111111111111111111,0x1111111111111111111111111111111111111111"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := fixtureConfig()
			env[tc.key] = tc.value
			if _, err := loadConfig(func(k string) string { return env[k] }); err == nil {
				t.Fatal("unsafe configuration accepted")
			}
		})
	}
}
