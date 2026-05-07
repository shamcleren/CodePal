import fs from "node:fs";
import path from "node:path";

import type { ProviderGatewayConfig } from "../../shared/appSettings";

export type GatewaySecretResolver = {
  resolveToken(provider: ProviderGatewayConfig): string;
};

type GatewaySecretStoreOptions = {
  filePath: string;
  env?: NodeJS.ProcessEnv;
};

export type GatewaySecretStore = GatewaySecretResolver & {
  hasToken(provider: ProviderGatewayConfig): boolean;
  updateToken(provider: ProviderGatewayConfig, token: string): void;
};

function readSecretMap(filePath: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string" && entry[1].trim().length > 0,
      ),
    );
  } catch {
    return {};
  }
}

function writeSecretMap(filePath: string, secrets: Record<string, string>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(secrets, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(filePath, 0o600);
}

export function createGatewaySecretResolver(
  options: GatewaySecretStoreOptions,
): GatewaySecretResolver {
  const env = options.env ?? process.env;
  return {
    resolveToken(provider: ProviderGatewayConfig): string {
      const tokenRef = provider.tokenRef.trim();
      if (tokenRef) {
        const secrets = readSecretMap(options.filePath);
        const fromFile = secrets[tokenRef]?.trim();
        if (fromFile) {
          return fromFile;
        }
      }
      const envName = provider.envFallback.trim();
      return envName ? env[envName]?.trim() ?? "" : "";
    },
  };
}

export function createGatewaySecretStore(
  options: GatewaySecretStoreOptions,
): GatewaySecretStore {
  const resolver = createGatewaySecretResolver(options);
  return {
    resolveToken: resolver.resolveToken,
    hasToken(provider: ProviderGatewayConfig): boolean {
      return resolver.resolveToken(provider).length > 0;
    },
    updateToken(provider: ProviderGatewayConfig, token: string): void {
      const cleaned = token.trim();
      if (!cleaned) {
        throw new Error("token is required");
      }
      const tokenRef = provider.tokenRef.trim();
      if (!tokenRef) {
        throw new Error("provider tokenRef is required");
      }
      const secrets = readSecretMap(options.filePath);
      secrets[tokenRef] = cleaned;
      writeSecretMap(options.filePath, secrets);
    },
  };
}
