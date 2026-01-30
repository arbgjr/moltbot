import { createVaultIntegrationService } from "./src/service.js";

export { createVaultIntegrationService };
export { VaultClient, VaultError, createVaultClientFromEnv } from "./src/vault-client.js";
export type { VaultConfig, VaultSecretMetadata, VaultReadResponse } from "./src/vault-client.js";

// Default export for plugin loading
export default createVaultIntegrationService();
