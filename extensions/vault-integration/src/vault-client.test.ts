import { describe, it, expect, vi, beforeEach } from "vitest";
import { VaultClient, VaultError, createVaultClientFromEnv } from "./vault-client.js";

describe("VaultClient", () => {
  const mockConfig = {
    addr: "http://localhost:8200",
    token: "test-token",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe("read", () => {
    it("should read secret successfully", async () => {
      const mockResponse = {
        data: {
          data: { username: "admin", password: "secret" },
          metadata: {
            created_time: "2026-01-30T00:00:00Z",
            version: 1,
          },
        },
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      });

      const client = new VaultClient(mockConfig);
      const result = await client.read("openclaw/data/credentials/test");

      expect(result).toEqual({
        data: { username: "admin", password: "secret" },
        metadata: {
          created_time: "2026-01-30T00:00:00Z",
          version: 1,
        },
      });
    });

    it("should return null for 404", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = new VaultClient(mockConfig);
      const result = await client.read("openclaw/data/credentials/notfound");

      expect(result).toBeNull();
    });

    it("should throw VaultError on failure", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: async () => "permission denied",
      });

      const client = new VaultClient(mockConfig);

      await expect(
        client.read("openclaw/data/credentials/test"),
      ).rejects.toThrow(VaultError);
    });
  });

  describe("write", () => {
    it("should write secret successfully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const client = new VaultClient(mockConfig);
      await expect(
        client.write("openclaw/data/credentials/test", {
          bot_token: "123456:ABC",
        }),
      ).resolves.not.toThrow();

      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:8200/v1/openclaw/data/credentials/test",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            "X-Vault-Token": "test-token",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({
            data: { bot_token: "123456:ABC" },
          }),
        }),
      );
    });
  });

  describe("list", () => {
    it("should list secrets successfully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            keys: ["anthropic", "telegram", "discord"],
          },
        }),
      });

      const client = new VaultClient(mockConfig);
      const result = await client.list("openclaw/metadata/credentials");

      expect(result).toEqual(["anthropic", "telegram", "discord"]);
    });

    it("should return empty array for 404", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = new VaultClient(mockConfig);
      const result = await client.list("openclaw/metadata/credentials");

      expect(result).toEqual([]);
    });
  });

  describe("delete", () => {
    it("should delete secret successfully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
      });

      const client = new VaultClient(mockConfig);
      await expect(
        client.delete("openclaw/data/credentials/test"),
      ).resolves.not.toThrow();
    });

    it("should not throw on 404", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = new VaultClient(mockConfig);
      await expect(
        client.delete("openclaw/data/credentials/notfound"),
      ).resolves.not.toThrow();
    });
  });

  describe("healthCheck", () => {
    it("should return true when healthy", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const client = new VaultClient(mockConfig);
      const result = await client.healthCheck();

      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error("Network error"));

      const client = new VaultClient(mockConfig);
      const result = await client.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe("getSealStatus", () => {
    it("should get seal status successfully", async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          sealed: false,
          initialized: true,
        }),
      });

      const client = new VaultClient(mockConfig);
      const result = await client.getSealStatus();

      expect(result).toEqual({
        sealed: false,
        initialized: true,
      });
    });
  });

  describe("createVaultClientFromEnv", () => {
    it("should create client from env vars", () => {
      process.env.VAULT_ADDR = "http://vault.example.com:8200";
      process.env.VAULT_TOKEN = "my-token";
      process.env.VAULT_NAMESPACE = "my-namespace";

      const client = createVaultClientFromEnv();

      expect(client).toBeInstanceOf(VaultClient);
      expect(client).not.toBeNull();
    });

    it("should return null without VAULT_TOKEN", () => {
      delete process.env.VAULT_TOKEN;

      const client = createVaultClientFromEnv();

      expect(client).toBeNull();
    });

    it("should use default addr if not set", () => {
      delete process.env.VAULT_ADDR;
      process.env.VAULT_TOKEN = "my-token";

      const client = createVaultClientFromEnv();

      expect(client).toBeInstanceOf(VaultClient);
    });
  });
});
