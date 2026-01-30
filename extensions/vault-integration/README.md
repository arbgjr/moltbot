# Vault Integration Extension

Store OpenClaw credentials in HashiCorp Vault for centralized secret management.

## Features

- ✅ **Centralized Secret Storage** - Single source of truth for credentials
- ✅ **Encryption at Rest** - Vault handles encryption automatically
- ✅ **Access Control** - Fine-grained policies and audit logging
- ✅ **Secret Rotation** - Easy credential rotation without restarting OpenClaw
- ✅ **Team Support** - Share secrets securely across team members
- ✅ **Backward Compatible** - Falls back to local files if Vault not configured

## Prerequisites

1. **HashiCorp Vault running**:
   ```bash
   # Using Docker (shared infrastructure)
   cd ~/.local/services
   docker-compose up -d vault
   
   # Unseal Vault
   export VAULT_ADDR=http://localhost:8200
   vault operator unseal <UNSEAL_KEY>
   ```

2. **Vault initialized with KV v2 engine**:
   ```bash
   vault secrets enable -path=openclaw kv-v2
   ```

3. **Vault token with appropriate permissions**:
   ```bash
   vault policy write openclaw - <<EOF
   path "openclaw/*" {
     capabilities = ["create", "read", "update", "delete", "list"]
   }
   EOF
   
   vault token create -policy=openclaw
   ```

## Installation

The extension is included in the OpenClaw monorepo under `extensions/vault-integration`.

### Enable the Extension

```bash
openclaw plugins enable vault-integration
```

## Configuration

### Option 1: Environment Variables (Recommended)

```bash
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=your-vault-token
export VAULT_NAMESPACE=openclaw  # Optional
```

Then restart OpenClaw:

```bash
openclaw gateway stop
openclaw gateway run --bind loopback --port 18789
```

### Option 2: Configuration File

Add to `~/.clawdbot/openclaw.json`:

```json
{
  "vault": {
    "enabled": true,
    "addr": "http://localhost:8200",
    "token": "${VAULT_TOKEN}",
    "namespace": "openclaw"
  }
}
```

**Note**: Use `${VAULT_TOKEN}` to reference environment variables for security.

## Secret Structure in Vault

The extension stores secrets using this structure:

```
openclaw/
├── data/
│   ├── credentials/
│   │   ├── anthropic       → Claude/Anthropic OAuth tokens
│   │   ├── telegram        → Telegram bot token
│   │   ├── discord         → Discord bot token
│   │   └── whatsapp        → WhatsApp credentials
│   └── config/
│       └── encryption      → Encryption keys
└── metadata/               → Secret metadata (versions, timestamps)
```

### Example: Store Telegram Bot Token

```bash
vault kv put openclaw/credentials/telegram \
  bot_token="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
```

### Example: Store Anthropic OAuth Credentials

```bash
vault kv put openclaw/credentials/anthropic \
  type="oauth" \
  provider="anthropic" \
  access_token="sk-ant-..." \
  refresh_token="..." \
  expires_at="1738281600"
```

## Usage

### Via Code (TypeScript)

```typescript
import { VaultClient } from "@openclaw/vault-integration";

const vault = new VaultClient({
  addr: "http://localhost:8200",
  token: process.env.VAULT_TOKEN!,
  namespace: "openclaw",
});

// Read secret
const secret = await vault.read("openclaw/data/credentials/telegram");
console.log(secret?.data.bot_token);

// Write secret
await vault.write("openclaw/data/credentials/telegram", {
  bot_token: "123456:ABC-DEF...",
  chat_id: "12345678",
});

// List secrets
const secrets = await vault.list("openclaw/metadata/credentials");
console.log(secrets); // ["anthropic", "telegram", "discord"]

// Delete secret
await vault.delete("openclaw/data/credentials/old-bot");

// Health check
const healthy = await vault.healthCheck();
console.log("Vault healthy:", healthy);

// Check seal status
const status = await vault.getSealStatus();
console.log("Sealed:", status.sealed);
```

### Via CLI (Future)

```bash
# Migrate existing credentials to Vault
openclaw vault migrate

# List stored credentials
openclaw vault list credentials

# Get specific credential
openclaw vault get credentials/telegram

# Store new credential
openclaw vault put credentials/telegram bot_token=123456:ABC...

# Delete credential
openclaw vault delete credentials/old-bot
```

## Migration from Local Files

**Manual migration** (until CLI tool is implemented):

1. **Export existing credentials**:
   ```bash
   cat ~/.claude/.credentials.json
   ```

2. **Store in Vault**:
   ```bash
   vault kv put openclaw/credentials/anthropic \
     type="oauth" \
     provider="anthropic" \
     access_token="<from-file>" \
     refresh_token="<from-file>" \
     expires_at="<from-file>"
   ```

3. **Enable Vault integration** (see Configuration above)

4. **Verify** OpenClaw loads credentials from Vault:
   ```bash
   openclaw gateway run --bind loopback --port 18789
   # Check logs for "vault-integration: ready"
   ```

5. **Backup and remove local files** (optional):
   ```bash
   mv ~/.claude/.credentials.json ~/.claude/.credentials.json.backup
   ```

## Troubleshooting

### Extension not loading

**Check logs**:
```bash
openclaw logs --follow | grep vault
```

**Common issues**:
- `VAULT_TOKEN not set` → Set environment variable
- `Vault is SEALED` → Run `vault operator unseal`
- `Vault health check failed` → Check if Vault is running
- `permission denied` → Token lacks required permissions

### Vault is sealed

```bash
export VAULT_ADDR=http://localhost:8200
vault status

# If sealed=true:
vault operator unseal <UNSEAL_KEY>
```

**Find unseal key**:
```bash
cat ~/.local/services/vault/backup/vault-init.json
```

### Test Vault connectivity

```bash
curl -H "X-Vault-Token: $VAULT_TOKEN" \
  http://localhost:8200/v1/sys/health
```

Should return 200 OK.

### Debug mode

```bash
export VAULT_TOKEN=your-token
export VAULT_ADDR=http://localhost:8200

# Run gateway with verbose logging
openclaw gateway run --bind loopback --port 18789 --verbose
```

## Security Best Practices

1. **Never commit `VAULT_TOKEN` to version control**
   - Use environment variables or `.env` files (gitignored)
   - Use Vault's AppRole or other auth methods in production

2. **Use least-privilege policies**
   ```bash
   # Create limited policy for OpenClaw
   vault policy write openclaw-readonly - <<EOF
   path "openclaw/data/credentials/*" {
     capabilities = ["read"]
   }
   EOF
   ```

3. **Rotate tokens regularly**
   ```bash
   vault token renew
   vault token create -policy=openclaw -ttl=720h
   ```

4. **Enable audit logging**
   ```bash
   vault audit enable file file_path=/vault/logs/audit.log
   ```

5. **Use namespaces** for multi-tenant setups
   ```bash
   export VAULT_NAMESPACE=team-name
   ```

## Development

### Run Tests

```bash
cd extensions/vault-integration
pnpm test
```

### Watch Mode

```bash
pnpm test:watch
```

### Build

No build step needed - TypeScript is transpiled at runtime via jiti.

## Architecture

```
┌─────────────────┐
│   OpenClaw      │
│   Gateway       │
└────────┬────────┘
         │
         │ 1. Request credentials
         ↓
┌─────────────────────────┐
│  Vault Integration      │
│  Extension              │
│  (this package)         │
└────────┬────────────────┘
         │
         │ 2. HTTP API call (KV v2)
         ↓
┌─────────────────┐
│  HashiCorp      │
│  Vault          │
│  (localhost:    │
│   8200)         │
└─────────────────┘
```

## Related Links

- [HashiCorp Vault Documentation](https://www.vaultproject.io/docs)
- [Vault KV v2 API](https://www.vaultproject.io/api-docs/secret/kv/kv-v2)
- [OpenClaw Issue #4727](https://github.com/openclaw/openclaw/issues/4727)

## Contributing

Contributions welcome! See the main OpenClaw repository for contribution guidelines.

## License

MIT License - see main OpenClaw repository for details.
