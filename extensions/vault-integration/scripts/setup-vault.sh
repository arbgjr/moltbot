#!/bin/bash
set -euo pipefail

# HashiCorp Vault Setup for OpenClaw
# This script configures Vault for OpenClaw secret management

echo "🔐 Setting up Vault for OpenClaw..."

# Check if Vault CLI is installed
if ! command -v vault &> /dev/null; then
    echo "❌ Vault CLI not found. Please install it first:"
    echo "   brew install vault"
    echo "   or visit: https://www.vaultproject.io/downloads"
    exit 1
fi

# Configuration
VAULT_ADDR="${VAULT_ADDR:-http://localhost:8200}"
export VAULT_ADDR

echo "📍 Using Vault at: $VAULT_ADDR"

# Check if Vault is running
if ! curl -s "$VAULT_ADDR/v1/sys/health" > /dev/null; then
    echo "❌ Vault is not running at $VAULT_ADDR"
    echo "   Start it with: docker-compose up -d vault"
    exit 1
fi

echo "✅ Vault is running"

# Check seal status  
SEAL_STATUS=$(vault status -format=json | jq -r '.sealed')
if [ "$SEAL_STATUS" = "true" ]; then
    echo "🔒 Vault is sealed. Please unseal it first:"
    echo "   vault operator unseal <UNSEAL_KEY>"
    echo "   Key location: ~/.local/services/vault/backup/vault-init.json"
    exit 1
fi

echo "✅ Vault is unsealed"

# Authenticate
if [ -z "${VAULT_TOKEN:-}" ]; then
    echo "🔑 Please enter your Vault root token:"
    read -s VAULT_TOKEN
    export VAULT_TOKEN
fi

# Enable KV v2 secrets engine
echo "📦 Enabling KV v2 secrets engine at path 'openclaw'..."
if vault secrets list | grep -q "openclaw/"; then
    echo "   ℹ️  Already enabled, skipping..."
else
    vault secrets enable -path=openclaw kv-v2
    echo "   ✅ Enabled"
fi

# Create policy for OpenClaw
echo "📜 Creating OpenClaw policy..."
vault policy write openclaw - <<POLICY
# Allow OpenClaw to manage its own secrets
path "openclaw/data/*" {
  capabilities = ["create", "read", "update", "delete"]
}

path "openclaw/metadata/*" {
  capabilities = ["read", "list"]
}

# Allow listing secret paths
path "openclaw/metadata" {
  capabilities = ["list"]
}
POLICY
echo "   ✅ Policy created"

# Create app token
echo "🎫 Creating OpenClaw application token..."
APP_TOKEN=$(vault token create \
  -policy=openclaw \
  -display-name="openclaw-app" \
  -ttl=720h \
  -renewable=true \
  -format=json | jq -r '.auth.client_token')

echo ""
echo "✅ Setup complete!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📝 SAVE THIS TOKEN (you won't see it again):"
echo ""
echo "   export VAULT_TOKEN=$APP_TOKEN"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. Add to your shell profile (~/.zshrc or ~/.bashrc):"
echo "     export VAULT_ADDR=$VAULT_ADDR"
echo "     export VAULT_TOKEN=$APP_TOKEN"
echo ""
echo "  2. Enable the extension:"
echo "     openclaw plugins enable vault-integration"
echo ""
echo "  3. Restart OpenClaw gateway"
echo ""
echo "  4. Migrate credentials (optional):"
echo "     See: extensions/vault-integration/README.md"
echo ""
