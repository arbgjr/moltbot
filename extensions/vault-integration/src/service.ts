import type { OpenClawPluginService } from "openclaw/plugin-sdk";
import { VaultClient, createVaultClientFromEnv } from "./vault-client.js";

/**
 * Vault Integration Plugin Service
 * 
 * Provides credential storage in HashiCorp Vault as an alternative to local files.
 * 
 * Configuration via environment variables:
 * - VAULT_ADDR: Vault server address (default: http://localhost:8200)
 * - VAULT_TOKEN: Authentication token (required)
 * - VAULT_NAMESPACE: Optional namespace
 * 
 * Or via openclaw.json:
 * {
 *   "vault": {
 *     "enabled": true,
 *     "addr": "http://localhost:8200",
 *     "token": "${VAULT_TOKEN}",
 *     "namespace": "openclaw"
 *   }
 * }
 */
export function createVaultIntegrationService(): OpenClawPluginService {
  let vaultClient: VaultClient | null = null;

  return {
    id: "vault-integration",

    async start(ctx) {
      const cfg = ctx.config.vault;

      // Try config first, then env vars
      if (cfg?.enabled) {
        const token = cfg.token?.trim();
        if (!token) {
          ctx.logger.warn("vault-integration: enabled but no token provided");
          return;
        }

        vaultClient = new VaultClient({
          addr: cfg.addr || "http://localhost:8200",
          token,
          namespace: cfg.namespace,
        });

        ctx.logger.info(
          `vault-integration: configured from config (addr=${cfg.addr || "http://localhost:8200"})`,
        );
      } else {
        // Fallback to env vars
        vaultClient = createVaultClientFromEnv();

        if (!vaultClient) {
          ctx.logger.debug(
            "vault-integration: VAULT_TOKEN not set, plugin disabled",
          );
          return;
        }

        ctx.logger.info(
          `vault-integration: configured from env vars (addr=${process.env.VAULT_ADDR || "http://localhost:8200"})`,
        );
      }

      // Health check
      try {
        const healthy = await vaultClient.healthCheck();
        if (!healthy) {
          ctx.logger.warn("vault-integration: Vault health check failed");
          return;
        }

        const sealStatus = await vaultClient.getSealStatus();
        if (sealStatus.sealed) {
          ctx.logger.error(
            "vault-integration: Vault is SEALED! Run 'vault operator unseal' first",
          );
          vaultClient = null;
          return;
        }

        ctx.logger.info("vault-integration: Vault is healthy and unsealed");
      } catch (error) {
        ctx.logger.error(
          `vault-integration: health check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        vaultClient = null;
        return;
      }

      // Export client to be used by other parts of OpenClaw
      // This would be used by credential providers
      ctx.logger.info("vault-integration: ready");
    },

    async stop() {
      vaultClient = null;
    },
  };
}
