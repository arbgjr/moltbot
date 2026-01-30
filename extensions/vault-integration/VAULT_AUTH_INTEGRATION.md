# Vault Auth-Profiles Integration

## Overview

The vault-integration extension now integrates with OpenClaw's auth-profiles system to store and retrieve credentials from HashiCorp Vault instead of (or in addition to) local JSON files.

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenClaw Gateway                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Gateway starts                                          │
│  2. vault-integration extension loads                       │
│  3. VaultClient instance set on globalThis                  │
│  4. warmVaultAuthProfilesCache() called                     │
│     └─> Loads auth-profiles from Vault into cache          │
│                                                             │
│  5. When auth-profiles are needed:                          │
│     └─> loadAuthProfileStore()                              │
│         ├─> Check Vault cache first                         │
│         └─> Fall back to local JSON file                    │
│                                                             │
│  6. When auth-profiles are saved:                           │
│     └─> saveAuthProfileStore()                              │
│         ├─> Save to local JSON file (always)                │
│         └─> Save to Vault (async, best-effort)              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

**Startup:**
1. `vault-integration` extension starts
2. Sets `globalThis.__OPENCLAW_VAULT_CLIENT__`
3. Calls `warmVaultAuthProfilesCache()` to pre-load profiles

**Read:**
1. `loadAuthProfileStore()` called
2. Check `getVaultAuthProfilesFromCache()`
3. If found, use Vault data
4. If not, fall back to local file

**Write:**
1. `saveAuthProfileStore()` called
2. Save to local file (synchronous, guaranteed)
3. Save to Vault (asynchronous, best-effort)
4. Update cache on successful Vault write

## Vault Storage Path

Auth-profiles are stored at:
```
openclaw/data/auth-profiles
```

## Data Format

Same as local `auth-profiles.json`:

```json
{
  "version": 1,
  "profiles": {
    "anthropic:default": {
      "type": "oauth",
      "provider": "anthropic",
      "access": "...",
      "refresh": "...",
      "expires": 1234567890
    },
    "openai:default": {
      "type": "api_key",
      "provider": "openai",
      "key": "..."
    }
  },
  "order": {
    "anthropic": ["anthropic:default"]
  },
  "lastGood": {
    "anthropic": "anthropic:default"
  },
  "usageStats": {
    "anthropic:default": {
      "used": 5,
      "lastUsed": 1234567890
    }
  }
}
```

## Cache Strategy

**Warm Cache Approach:**
- Cache is loaded when extension starts (non-blocking)
- Synchronous API calls use cached data
- No async/await needed in existing code
- Cache is updated when profiles are saved

**Benefits:**
- No breaking API changes
- Fast synchronous access
- Graceful fallback to local files
- Best-effort Vault writes

## Migration Path

### Option 1: Manual Migration

```bash
# 1. Vault must be running and configured
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=your-token

# 2. Start gateway with vault-integration enabled
openclaw gateway run --bind loopback --port 18789

# 3. Profiles are automatically loaded from local file
# 4. Use openclaw CLI to trigger a save (updates Vault)
openclaw login  # Re-authenticate triggers save

# 5. Verify in Vault
vault kv get openclaw/data/auth-profiles
```

### Option 2: Direct Upload

```bash
# Export local profiles
cat ~/.openclaw/auth-profiles.json > /tmp/profiles.json

# Upload to Vault
vault kv put openclaw/data/auth-profiles @/tmp/profiles.json

# Clean up
rm /tmp/profiles.json
```

### Option 3: Automatic (Future)

```bash
# Not yet implemented
openclaw vault migrate
```

## Testing

Run integration tests:

```bash
pnpm test src/agents/auth-profiles/vault-integration.test.ts
```

## Monitoring

Check if Vault integration is active:

```bash
# Gateway logs
openclaw logs | grep "vault-integration"

# Should see:
# vault-integration: ready
# vault-integration: auth-profiles loaded from Vault
```

## Fallback Behavior

**Vault unavailable:**
- Uses local JSON files
- No errors thrown
- Operates normally

**Vault read fails:**
- Falls back to local file
- Logs warning
- Continues operation

**Vault write fails:**
- Local file still saved
- Logs warning
- No data loss

## Security Considerations

1. **Token Management:**
   - Use least-privilege tokens
   - Rotate tokens regularly
   - Never commit tokens to version control

2. **Network Security:**
   - Use TLS for Vault (https://)
   - Restrict network access to Vault
   - Use Vault namespaces for isolation

3. **Backup:**
   - Local files remain as backup
   - Vault data is replicated (if configured)
   - Enable Vault audit logging

## Troubleshooting

### Profiles not loading from Vault

```bash
# Check Vault connectivity
vault status

# Verify profiles exist
vault kv get openclaw/data/auth-profiles

# Check gateway logs
openclaw logs --follow | grep vault
```

### Profiles not saving to Vault

```bash
# Check token permissions
vault token lookup

# Verify policy allows writes
vault policy read openclaw

# Check for errors in logs
openclaw logs | grep "failed to save.*Vault"
```

### Cache not warming

```bash
# Check extension is loaded
openclaw plugins list

# Check gateway startup logs
openclaw logs | grep "vault-integration: ready"
```

## Future Improvements

- [ ] Automatic migration command
- [ ] Health check endpoint
- [ ] Metrics/telemetry
- [ ] Multi-profile support per provider
- [ ] Profile encryption at rest
- [ ] Vault KV v1 support
- [ ] Auto-refresh from Vault (TTL-based)
