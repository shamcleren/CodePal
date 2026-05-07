import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderGatewayConfig } from "../../shared/appSettings";
import { createGatewaySecretResolver, createGatewaySecretStore } from "./gatewaySecrets";

const tempDirs: string[] = [];

function makeProvider(overrides: Partial<ProviderGatewayConfig> = {}): ProviderGatewayConfig {
  return {
    type: "anthropic-compatible",
    displayName: "Test",
    baseUrl: "https://example.com/anthropic",
    authScheme: "bearer",
    tokenRef: "test.token",
    envFallback: "TEST_GATEWAY_TOKEN",
    headers: {},
    modelMappings: {
      "anthropic/Test-Sonnet": "test-sonnet",
    },
    ...overrides,
  };
}

function tempFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-gateway-secrets-"));
  tempDirs.push(dir);
  return path.join(dir, "provider-gateway-secrets.json");
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("gatewaySecrets", () => {
  it("resolves provider tokens from the local secret file before env fallback", () => {
    const filePath = tempFile();
    fs.writeFileSync(filePath, JSON.stringify({ "test.token": "from-file" }), "utf8");
    const resolver = createGatewaySecretResolver({
      filePath,
      env: { TEST_GATEWAY_TOKEN: "from-env" },
    });

    expect(resolver.resolveToken(makeProvider())).toBe("from-file");
  });

  it("falls back to the provider env variable when no local secret is configured", () => {
    const resolver = createGatewaySecretResolver({
      filePath: tempFile(),
      env: { TEST_GATEWAY_TOKEN: "from-env" },
    });

    expect(resolver.resolveToken(makeProvider())).toBe("from-env");
  });

  it("reports token presence without returning the token", () => {
    const filePath = tempFile();
    fs.writeFileSync(filePath, JSON.stringify({ "test.token": "secret-value" }), "utf8");
    const store = createGatewaySecretStore({ filePath, env: {} });

    expect(store.hasToken(makeProvider())).toBe(true);
    expect(JSON.stringify(store)).not.toContain("secret-value");
  });

  it("writes replacement tokens with owner-only permissions", () => {
    const filePath = tempFile();
    const store = createGatewaySecretStore({ filePath, env: {} });

    store.updateToken(makeProvider(), "new-secret");

    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, string>;
    expect(raw["test.token"]).toBe("new-secret");
    expect((fs.statSync(filePath).mode & 0o777).toString(8)).toBe("600");
  });
});
