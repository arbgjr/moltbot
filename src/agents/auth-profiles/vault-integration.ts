import { log } from "./constants.js";
import type { AuthProfileStore } from "./types.js";

// Type-only import to avoid rootDir issues
type VaultClient = {
  read<T = Record<string, unknown>>(
    path: string,
  ): Promise<{ data: T; metadata?: Record<string, unknown> } | null>;
  write(path: string, data: Record<string, unknown>): Promise<void>;
  list(path: string): Promise<string[]>;
  delete(path: string): Promise<void>;
  healthCheck(): Promise<boolean>;
  getSealStatus(): Promise<{ sealed: boolean; initialized: boolean }>;
};

/**
 * Get the VaultClient instance if available.
 * The vault-integration extension sets this on globalThis when it initializes.
 */
export function getVaultClient(): VaultClient | null {
  if (typeof globalThis === "undefined") {
    return null;
  }
  return (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] as VaultClient | null;
}

/**
 * Check if Vault integration is available and healthy.
 */
export function isVaultAvailable(): boolean {
  return getVaultClient() !== null;
}

// Note: For KV v2, the path must include /data/ in the middle
// Format: <mount>/data/<secret-path>
const VAULT_AUTH_PROFILES_PATH = "openclaw/data/auth-profiles";

// Cache for Vault-loaded profiles (warm cache approach)
let vaultProfilesCache: AuthProfileStore | null = null;
let vaultCacheLoaded = false;

/**
 * Load auth-profiles from Vault.
 * Returns null if Vault is not available or read fails.
 */
export async function loadAuthProfilesFromVault(): Promise<AuthProfileStore | null> {
  const vaultClient = getVaultClient();
  if (!vaultClient) {
    log.debug("vault integration: VaultClient not available");
    return null;
  }

  try {
    log.debug("vault integration: reading from path", { path: VAULT_AUTH_PROFILES_PATH });
    const response = await vaultClient.read<AuthProfileStore>(VAULT_AUTH_PROFILES_PATH);

    log.debug("vault integration: raw response", {
      hasResponse: !!response,
      hasData: !!response?.data,
      dataKeys: response?.data ? Object.keys(response.data) : [],
    });

    if (!response?.data) {
      log.debug("vault integration: no response or no data in response");
      return null;
    }

    // Validate the structure
    const data = response.data;
    if (!data || typeof data !== "object") {
      log.debug("vault integration: data is not an object", { dataType: typeof data });
      return null;
    }

    if (!data.profiles) {
      log.debug("vault integration: no profiles in data", { dataKeys: Object.keys(data) });
      return null;
    }

    log.debug("vault integration: successfully loaded auth-profiles", {
      profileCount: Object.keys(data.profiles).length,
    });

    return data as AuthProfileStore;
  } catch (error) {
    // Vault read failed, return null to trigger fallback
    log.debug("vault integration: error reading from Vault", { error });
    return null;
  }
}

/**
 * Warm the cache by loading auth-profiles from Vault in the background.
 * Call this when the gateway starts to prepare the cache.
 */
export async function warmVaultAuthProfilesCache(): Promise<void> {
  if (!isVaultAvailable()) {
    return;
  }

  try {
    log.debug("vault integration: warming auth-profiles cache from Vault");
    const store = await loadAuthProfilesFromVault();
    if (store) {
      vaultProfilesCache = store;
      vaultCacheLoaded = true;
      log.info("vault integration: auth-profiles loaded from Vault", {
        profileCount: Object.keys(store.profiles).length,
      });
    } else {
      vaultCacheLoaded = true;
      log.debug("vault integration: no auth-profiles found in Vault");
    }
  } catch (error) {
    vaultCacheLoaded = true;
    log.debug("vault integration: failed to warm cache", { error });
  }
}

/**
 * Get auth-profiles from Vault cache if available.
 * Returns null if cache is not loaded or empty.
 */
export function getVaultAuthProfilesFromCache(): AuthProfileStore | null {
  if (!vaultCacheLoaded) {
    return null;
  }
  return vaultProfilesCache;
}

/**
 * Invalidate the Vault cache, forcing a reload on next access.
 */
export function invalidateVaultCache(): void {
  vaultProfilesCache = null;
  vaultCacheLoaded = false;
}

/**
 * Save auth-profiles to Vault.
 * Returns true if successful, false otherwise.
 */
export async function saveAuthProfilesToVault(store: AuthProfileStore): Promise<boolean> {
  const vaultClient = getVaultClient();
  if (!vaultClient) {
    return false;
  }

  try {
    await vaultClient.write(VAULT_AUTH_PROFILES_PATH, {
      version: store.version,
      profiles: store.profiles,
      order: store.order,
      lastGood: store.lastGood,
      usageStats: store.usageStats,
    });

    // Update cache
    vaultProfilesCache = { ...store };
    vaultCacheLoaded = true;

    log.debug("vault integration: auth-profiles saved to Vault");
    return true;
  } catch (error) {
    // Vault write failed, but don't throw - local file is still saved
    log.warn("vault integration: failed to save auth-profiles to Vault", { error });
    return false;
  }
}
