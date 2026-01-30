import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVaultAuthProfilesFromCache,
  getVaultClient,
  invalidateVaultCache,
  isVaultAvailable,
  loadAuthProfilesFromVault,
  saveAuthProfilesToVault,
  warmVaultAuthProfilesCache,
} from "./vault-integration.js";

// Mock VaultClient type
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

describe("vault-integration", () => {
  const mockVaultClient: VaultClient = {
    read: vi.fn(),
    write: vi.fn(),
    list: vi.fn(),
    delete: vi.fn(),
    healthCheck: vi.fn(),
    getSealStatus: vi.fn(),
  } as unknown as VaultClient;

  beforeEach(() => {
    // Clear the cache before each test
    invalidateVaultCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up globalThis
    if (typeof globalThis !== "undefined") {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = null;
    }
    invalidateVaultCache();
  });

  describe("getVaultClient", () => {
    it("returns null when no client is set", () => {
      expect(getVaultClient()).toBeNull();
    });

    it("returns the client when set on globalThis", () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      expect(getVaultClient()).toBe(mockVaultClient);
    });
  });

  describe("isVaultAvailable", () => {
    it("returns false when no client is set", () => {
      expect(isVaultAvailable()).toBe(false);
    });

    it("returns true when client is set", () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      expect(isVaultAvailable()).toBe(true);
    });
  });

  describe("loadAuthProfilesFromVault", () => {
    it("returns null when Vault is not available", async () => {
      const result = await loadAuthProfilesFromVault();
      expect(result).toBeNull();
    });

    it("returns null when Vault returns no data", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      vi.mocked(mockVaultClient.read).mockResolvedValue(null);

      const result = await loadAuthProfilesFromVault();
      expect(result).toBeNull();
    });

    it("returns auth profiles when Vault returns valid data", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      const mockStore = {
        version: 1,
        profiles: {
          "anthropic:default": {
            type: "oauth" as const,
            provider: "anthropic",
            access: "test-access",
            refresh: "test-refresh",
            expires: 1234567890,
          },
        },
      };
      vi.mocked(mockVaultClient.read).mockResolvedValue({
        data: mockStore,
      });

      const result = await loadAuthProfilesFromVault();
      expect(result).toEqual(mockStore);
    });

    it("returns null when Vault read fails", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      vi.mocked(mockVaultClient.read).mockRejectedValue(new Error("Vault error"));

      const result = await loadAuthProfilesFromVault();
      expect(result).toBeNull();
    });
  });

  describe("saveAuthProfilesToVault", () => {
    it("returns false when Vault is not available", async () => {
      const result = await saveAuthProfilesToVault({
        version: 1,
        profiles: {},
      });
      expect(result).toBe(false);
    });

    it("returns true and saves to Vault when successful", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      vi.mocked(mockVaultClient.write).mockResolvedValue();

      const store = {
        version: 1,
        profiles: {
          "test:default": {
            type: "api_key" as const,
            provider: "test",
            key: "test-key",
          },
        },
      };

      const result = await saveAuthProfilesToVault(store);
      expect(result).toBe(true);
      expect(mockVaultClient.write).toHaveBeenCalledWith("openclaw/data/auth-profiles", store);
    });

    it("returns false when Vault write fails", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      vi.mocked(mockVaultClient.write).mockRejectedValue(new Error("Vault error"));

      const result = await saveAuthProfilesToVault({
        version: 1,
        profiles: {},
      });
      expect(result).toBe(false);
    });
  });

  describe("warmVaultAuthProfilesCache", () => {
    it("does nothing when Vault is not available", async () => {
      await warmVaultAuthProfilesCache();
      expect(mockVaultClient.read).not.toHaveBeenCalled();
    });

    it("loads profiles into cache when available", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      const mockStore = {
        version: 1,
        profiles: {
          "test:default": {
            type: "api_key" as const,
            provider: "test",
            key: "test-key",
          },
        },
      };
      vi.mocked(mockVaultClient.read).mockResolvedValue({
        data: mockStore,
      });

      await warmVaultAuthProfilesCache();

      const cached = getVaultAuthProfilesFromCache();
      expect(cached).toEqual(mockStore);
    });

    it("handles Vault read errors gracefully", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      vi.mocked(mockVaultClient.read).mockRejectedValue(new Error("Vault error"));

      await warmVaultAuthProfilesCache();

      const cached = getVaultAuthProfilesFromCache();
      expect(cached).toBeNull();
    });
  });

  describe("cache management", () => {
    it("returns null from cache before warming", () => {
      expect(getVaultAuthProfilesFromCache()).toBeNull();
    });

    it("updates cache when saving to Vault", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      vi.mocked(mockVaultClient.write).mockResolvedValue();

      const store = {
        version: 1,
        profiles: {
          "test:default": {
            type: "api_key" as const,
            provider: "test",
            key: "test-key",
          },
        },
      };

      await saveAuthProfilesToVault(store);

      const cached = getVaultAuthProfilesFromCache();
      expect(cached).toEqual(store);
    });

    it("clears cache when invalidated", async () => {
      (globalThis as Record<string, unknown>)["__OPENCLAW_VAULT_CLIENT__"] = mockVaultClient;
      vi.mocked(mockVaultClient.write).mockResolvedValue();

      const store = {
        version: 1,
        profiles: {},
      };

      await saveAuthProfilesToVault(store);
      expect(getVaultAuthProfilesFromCache()).toEqual(store);

      invalidateVaultCache();
      expect(getVaultAuthProfilesFromCache()).toBeNull();
    });
  });
});
