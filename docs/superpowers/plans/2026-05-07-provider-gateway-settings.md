# Provider Gateway Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a maintainable CodePal settings surface for the local Claude Desktop Provider Gateway and reorganize settings into a calmer operational console.

**Architecture:** Main owns gateway status, secrets, health checks, and sanitized IPC results. Renderer consumes renderer-safe shared types through preload and renders a dedicated Provider Gateway panel. Existing settings panels are retained but regrouped into Overview, Provider Gateway, Agent Integrations, Usage Accounts, Preferences, and Advanced.

**Tech Stack:** Electron main/preload IPC, React + TypeScript renderer, Vitest unit tests, existing CSS in `src/renderer/styles.css`, YAML settings in `src/shared/appSettings.ts`.

---

## File Structure

- Create `src/shared/providerGatewayTypes.ts`
  - Renderer-safe status, health-check, token-update result, and model mapping types.
- Modify `src/main/gateway/gatewaySecrets.ts`
  - Add safe token presence and token update helpers; never return token contents.
- Create `src/main/gateway/providerGatewayStatus.ts`
  - Build `ProviderGatewayStatus` from settings, server diagnostics, secrets, and last health check.
- Modify `src/main/gateway/claudeDesktopGateway.ts`
  - Reuse health-check result shape or adapt it into shared renderer-safe status.
- Modify `src/main/main.ts`
  - Track gateway listener diagnostics and last health check.
  - Register provider gateway IPC handlers.
- Modify `src/main/preload/index.ts`
  - Expose provider gateway IPC calls to renderer.
- Modify `src/renderer/codepal.d.ts`
  - Add provider gateway API methods.
- Create `src/renderer/components/ProviderGatewayPanel.tsx`
  - Dedicated UI for local URL, provider profile, token update, model mapping, health check, and Claude Desktop setup copy actions.
- Create `src/renderer/components/ProviderGatewayPanel.test.tsx`
  - Renderer tests for token states, input clearing, model mapping, and setup copy values.
- Modify `src/renderer/App.tsx`
  - Add provider gateway state loaders/actions.
  - Reorganize settings sections into new information architecture.
- Modify `src/renderer/i18n.tsx`
  - Add Chinese and English strings for new settings sections and provider gateway panel.
- Modify `src/renderer/styles.css`
  - Add compact operational styles for gateway/status/table rows.
- Modify existing tests:
  - `src/main/preload/index.test.ts`
  - `src/shared/appSettings.test.ts` only if new shared type behavior requires it.
  - `src/renderer/App.test.tsx` for new navigation labels.

---

### Task 1: Shared Provider Gateway Types

**Files:**
- Create: `src/shared/providerGatewayTypes.ts`
- Test through later main and renderer tests.

- [ ] **Step 1: Create renderer-safe shared types**

Add:

```ts
export type ProviderGatewayListenerStatus =
  | { state: "listening"; localUrl: string; host: string; port: number }
  | { state: "disabled"; localUrl: string; host: string; port: number }
  | { state: "unavailable"; localUrl: string; host: string; port: number; message: string };

export type ProviderGatewayProviderSummary = {
  id: string;
  type: "anthropic-compatible";
  displayName: string;
  baseUrl: string;
  authScheme: "bearer";
  tokenConfigured: boolean;
  envFallback: string;
};

export type ProviderGatewayModelMappingStatus = {
  claudeModel: string;
  upstreamModel: string;
  health: "unknown" | "checking" | "ok" | "error";
  status?: number;
  error?: string;
};

export type ProviderGatewayHealthCheckSummary = {
  checkedAt: number;
  ok: boolean;
  models: ProviderGatewayModelMappingStatus[];
};

export type ProviderGatewayStatus = {
  enabled: boolean;
  listener: ProviderGatewayListenerStatus;
  activeProviderId: string | null;
  provider: ProviderGatewayProviderSummary | null;
  modelMappings: ProviderGatewayModelMappingStatus[];
  claudeDesktop: {
    baseUrl: string;
    apiKey: "local-proxy";
    authScheme: "bearer";
    inferenceModels: string[];
  };
  lastHealthCheck: ProviderGatewayHealthCheckSummary | null;
};

export type ProviderGatewayTokenUpdateResult = {
  ok: boolean;
  status: ProviderGatewayStatus;
  message?: string;
};
```

- [ ] **Step 2: Run type-aware build later**

Run after Task 2 and Task 3:

```bash
npm run build
```

Expected: build compiles once imports are wired.

---

### Task 2: Secret Store Helpers

**Files:**
- Modify: `src/main/gateway/gatewaySecrets.ts`
- Test: `src/main/gateway/gatewaySecrets.test.ts`

- [ ] **Step 1: Write failing tests for token presence and update**

Add tests:

```ts
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

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  expect(raw["test.token"]).toBe("new-secret");
  expect((fs.statSync(filePath).mode & 0o777).toString(8)).toBe("600");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/main/gateway/gatewaySecrets.test.ts
```

Expected: FAIL because `createGatewaySecretStore`, `hasToken`, and `updateToken` do not exist.

- [ ] **Step 3: Implement secret store helpers**

Add:

```ts
export type GatewaySecretStore = GatewaySecretResolver & {
  hasToken(provider: ProviderGatewayConfig): boolean;
  updateToken(provider: ProviderGatewayConfig, token: string): void;
};

function writeSecretMap(filePath: string, secrets: Record<string, string>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(secrets, null, 2) + "\n", {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.chmodSync(filePath, 0o600);
}

export function createGatewaySecretStore(options: GatewaySecretStoreOptions): GatewaySecretStore {
  const resolver = createGatewaySecretResolver(options);
  return {
    resolveToken: resolver.resolveToken,
    hasToken(provider) {
      return resolver.resolveToken(provider).length > 0;
    },
    updateToken(provider, token) {
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
```

Also import `node:path`.

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
npm test -- src/main/gateway/gatewaySecrets.test.ts
```

Expected: PASS.

---

### Task 3: Main Gateway Status Builder

**Files:**
- Create: `src/main/gateway/providerGatewayStatus.ts`
- Test: `src/main/gateway/providerGatewayStatus.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests:

```ts
import { describe, expect, it } from "vitest";
import { normalizeAppSettings } from "../../shared/appSettings";
import { buildProviderGatewayStatus } from "./providerGatewayStatus";

describe("providerGatewayStatus", () => {
  it("builds a sanitized configured status", () => {
    const settings = normalizeAppSettings({});
    const status = buildProviderGatewayStatus({
      settings,
      tokenConfigured: true,
      listener: { state: "listening", host: "127.0.0.1", port: 15721 },
      lastHealthCheck: null,
    });

    expect(status.provider?.tokenConfigured).toBe(true);
    expect(status.listener).toMatchObject({
      state: "listening",
      localUrl: "http://127.0.0.1:15721",
    });
    expect(status.claudeDesktop).toEqual({
      baseUrl: "http://127.0.0.1:15721",
      apiKey: "local-proxy",
      authScheme: "bearer",
      inferenceModels: [
        "anthropic/MiMo-V2.5-Pro",
        "anthropic/MiMo-V2.5",
        "anthropic/MiMo-V2-Pro",
        "anthropic/MiMo-V2-Omni",
      ],
    });
    expect(JSON.stringify(status)).not.toContain("mimo.gateway.token");
  });

  it("marks health results onto model mappings", () => {
    const settings = normalizeAppSettings({});
    const status = buildProviderGatewayStatus({
      settings,
      tokenConfigured: true,
      listener: { state: "listening", host: "127.0.0.1", port: 15721 },
      lastHealthCheck: {
        checkedAt: 10,
        ok: false,
        models: [
          {
            claudeModel: "anthropic/MiMo-V2.5-Pro",
            upstreamModel: "mimo-v2.5-pro",
            health: "error",
            status: 401,
          },
        ],
      },
    });

    expect(status.modelMappings[0]).toMatchObject({
      claudeModel: "anthropic/MiMo-V2.5-Pro",
      upstreamModel: "mimo-v2.5-pro",
      health: "error",
      status: 401,
    });
  });
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npm test -- src/main/gateway/providerGatewayStatus.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement status builder**

Implement:

```ts
import type { AppSettings } from "../../shared/appSettings";
import type {
  ProviderGatewayHealthCheckSummary,
  ProviderGatewayListenerStatus,
  ProviderGatewayStatus,
} from "../../shared/providerGatewayTypes";

type ListenerInput =
  | { state: "listening"; host: string; port: number }
  | { state: "disabled"; host: string; port: number }
  | { state: "unavailable"; host: string; port: number; message: string };

type BuildProviderGatewayStatusInput = {
  settings: AppSettings;
  tokenConfigured: boolean;
  listener: ListenerInput;
  lastHealthCheck: ProviderGatewayHealthCheckSummary | null;
};

function localUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}

function listenerStatus(input: ListenerInput): ProviderGatewayListenerStatus {
  const url = localUrl(input.host, input.port);
  if (input.state === "unavailable") {
    return { ...input, localUrl: url };
  }
  return { ...input, localUrl: url };
}

export function buildProviderGatewayStatus(
  input: BuildProviderGatewayStatusInput,
): ProviderGatewayStatus {
  const gateway = input.settings.providerGateway;
  const provider = gateway.providers[gateway.activeProvider] ?? null;
  const listener = listenerStatus(input.listener);
  const healthByModel = new Map(
    (input.lastHealthCheck?.models ?? []).map((model) => [model.claudeModel, model]),
  );
  const modelMappings = provider
    ? Object.entries(provider.modelMappings).map(([claudeModel, upstreamModel]) => ({
        claudeModel,
        upstreamModel,
        health: healthByModel.get(claudeModel)?.health ?? "unknown",
        status: healthByModel.get(claudeModel)?.status,
        error: healthByModel.get(claudeModel)?.error,
      }))
    : [];

  return {
    enabled: gateway.enabled,
    listener,
    activeProviderId: provider ? gateway.activeProvider : null,
    provider: provider
      ? {
          id: gateway.activeProvider,
          type: provider.type,
          displayName: provider.displayName,
          baseUrl: provider.baseUrl,
          authScheme: provider.authScheme,
          tokenConfigured: input.tokenConfigured,
          envFallback: provider.envFallback,
        }
      : null,
    modelMappings,
    claudeDesktop: {
      baseUrl: listener.localUrl,
      apiKey: "local-proxy",
      authScheme: "bearer",
      inferenceModels: modelMappings.map((mapping) => mapping.claudeModel),
    },
    lastHealthCheck: input.lastHealthCheck,
  };
}
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
npm test -- src/main/gateway/providerGatewayStatus.test.ts
```

Expected: PASS.

---

### Task 4: Provider Gateway IPC Handlers

**Files:**
- Modify: `src/main/main.ts`
- Modify: `src/main/gateway/claudeDesktopGateway.ts`
- Test indirectly through preload and panel tests; manual main IPC behavior can be covered by extracting helpers if needed.

- [ ] **Step 1: Adapt health check result to shared summary**

In `src/main/gateway/claudeDesktopGateway.ts`, import `ProviderGatewayHealthCheckSummary` and change `runProviderHealthCheck` to return or be mappable to:

```ts
{
  checkedAt: Date.now(),
  ok: models.every((model) => model.ok),
  models: models.map((model) => ({
    claudeModel: model.claudeModel,
    upstreamModel: model.upstreamModel,
    health: model.ok ? "ok" : "error",
    status: model.status,
    error: model.error,
  })),
}
```

- [ ] **Step 2: Track listener state in main**

In `src/main/main.ts`, add module-level state:

```ts
let providerGatewayListener:
  | { state: "listening"; host: string; port: number }
  | { state: "disabled"; host: string; port: number }
  | { state: "unavailable"; host: string; port: number; message: string }
  = { state: "unavailable", host: "127.0.0.1", port: 15721, message: "Provider gateway not started" };
let providerGatewayHealthCheck: ProviderGatewayHealthCheckSummary | null = null;
```

Update `startClaudeDesktopProviderGateway`:

```ts
if (!settings.enabled) {
  providerGatewayListener = { state: "disabled", host: settings.host, port: settings.port };
  console.log("[CodePal Gateway] disabled");
  return;
}
...
if (result.status === "listening") {
  providerGatewayListener = { state: "listening", host, port };
  providerGatewayServer = server;
  console.log(`[CodePal Gateway] listening on http://${host}:${port}`);
  return;
}
...
providerGatewayListener = {
  state: "unavailable",
  host,
  port,
  message: result.diagnostics.message ?? result.error.message,
};
```

- [ ] **Step 3: Register IPC handlers**

In `wireActionResponseIpc`, add parameters for `gatewaySecretStore` if the store is created before wiring, or close over a module-level store.

Handlers:

```ts
ipcMain.handle("codepal:get-provider-gateway-status", () => {
  const settings = settingsService.getSettings();
  const provider = settings.providerGateway.providers[settings.providerGateway.activeProvider];
  return buildProviderGatewayStatus({
    settings,
    tokenConfigured: provider ? gatewaySecretStore.hasToken(provider) : false,
    listener: providerGatewayListener,
    lastHealthCheck: providerGatewayHealthCheck,
  });
});

ipcMain.handle("codepal:update-provider-gateway-token", (_event, payload: unknown) => {
  const providerId =
    payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).providerId === "string"
      ? (payload as Record<string, unknown>).providerId
      : "";
  const token =
    payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).token === "string"
      ? (payload as Record<string, unknown>).token
      : "";
  const settings = settingsService.getSettings();
  const provider = settings.providerGateway.providers[providerId];
  if (!provider) {
    throw new Error("provider not configured");
  }
  gatewaySecretStore.updateToken(provider, token);
  return {
    ok: true,
    status: buildProviderGatewayStatus({
      settings,
      tokenConfigured: true,
      listener: providerGatewayListener,
      lastHealthCheck: providerGatewayHealthCheck,
    }),
  };
});

ipcMain.handle("codepal:run-provider-gateway-health-check", async () => {
  const settings = settingsService.getSettings();
  const result = await runProviderHealthCheck({
    settings,
    secrets: gatewaySecretStore,
  });
  providerGatewayHealthCheck = {
    checkedAt: Date.now(),
    ok: result.ok,
    models: result.models.map((model) => ({
      claudeModel: model.claudeModel,
      upstreamModel: model.upstreamModel,
      health: model.ok ? "ok" : "error",
      status: model.status,
      error: model.error,
    })),
  };
  const provider = settings.providerGateway.providers[settings.providerGateway.activeProvider];
  return buildProviderGatewayStatus({
    settings,
    tokenConfigured: provider ? gatewaySecretStore.hasToken(provider) : false,
    listener: providerGatewayListener,
    lastHealthCheck: providerGatewayHealthCheck,
  });
});
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: PASS. Fix import/type errors before continuing.

---

### Task 5: Preload And Renderer API

**Files:**
- Modify: `src/main/preload/index.ts`
- Modify: `src/renderer/codepal.d.ts`
- Test: `src/main/preload/index.test.ts`

- [ ] **Step 1: Write failing preload test**

Add expectations that `window.codepal` exposes:

```ts
expect(api.getProviderGatewayStatus).toBeTypeOf("function");
expect(api.updateProviderGatewayToken).toBeTypeOf("function");
expect(api.runProviderGatewayHealthCheck).toBeTypeOf("function");
```

Use the existing preload test style.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/main/preload/index.test.ts
```

Expected: FAIL because API functions do not exist.

- [ ] **Step 3: Expose preload functions**

Add imports:

```ts
import type {
  ProviderGatewayStatus,
  ProviderGatewayTokenUpdateResult,
} from "../../shared/providerGatewayTypes";
```

Expose:

```ts
getProviderGatewayStatus() {
  return ipcRenderer.invoke("codepal:get-provider-gateway-status") as Promise<ProviderGatewayStatus>;
},
updateProviderGatewayToken(providerId: string, token: string) {
  return ipcRenderer.invoke("codepal:update-provider-gateway-token", {
    providerId,
    token,
  }) as Promise<ProviderGatewayTokenUpdateResult>;
},
runProviderGatewayHealthCheck() {
  return ipcRenderer.invoke("codepal:run-provider-gateway-health-check") as Promise<ProviderGatewayStatus>;
},
```

Update `src/renderer/codepal.d.ts` with matching methods.

- [ ] **Step 4: Run preload test**

Run:

```bash
npm test -- src/main/preload/index.test.ts
```

Expected: PASS.

---

### Task 6: ProviderGatewayPanel Component

**Files:**
- Create: `src/renderer/components/ProviderGatewayPanel.tsx`
- Create: `src/renderer/components/ProviderGatewayPanel.test.tsx`
- Modify: `src/renderer/i18n.tsx`

- [ ] **Step 1: Write failing render tests**

Create tests:

```tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ProviderGatewayStatus } from "../../shared/providerGatewayTypes";
import { I18nProvider, createI18nValue } from "../i18n";
import { ProviderGatewayPanel } from "./ProviderGatewayPanel";

function renderPanel(status: ProviderGatewayStatus) {
  return renderToStaticMarkup(
    <I18nProvider value={createI18nValue("en")}>
      <ProviderGatewayPanel
        status={status}
        loading={false}
        tokenSaving={false}
        healthChecking={false}
        feedback={null}
        error={null}
        onRefresh={vi.fn()}
        onSaveToken={vi.fn()}
        onRunHealthCheck={vi.fn()}
        onCopy={vi.fn()}
      />
    </I18nProvider>,
  );
}

const status: ProviderGatewayStatus = {
  enabled: true,
  listener: {
    state: "listening",
    localUrl: "http://127.0.0.1:15721",
    host: "127.0.0.1",
    port: 15721,
  },
  activeProviderId: "mimo",
  provider: {
    id: "mimo",
    type: "anthropic-compatible",
    displayName: "MiMo Gateway",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/anthropic",
    authScheme: "bearer",
    tokenConfigured: true,
    envFallback: "MIMO_GATEWAY_TOKEN",
  },
  modelMappings: [
    {
      claudeModel: "anthropic/MiMo-V2.5-Pro",
      upstreamModel: "mimo-v2.5-pro",
      health: "ok",
      status: 200,
    },
  ],
  claudeDesktop: {
    baseUrl: "http://127.0.0.1:15721",
    apiKey: "local-proxy",
    authScheme: "bearer",
    inferenceModels: ["anthropic/MiMo-V2.5-Pro"],
  },
  lastHealthCheck: null,
};

describe("ProviderGatewayPanel", () => {
  it("renders provider status and model mappings without secrets", () => {
    const html = renderPanel(status);
    expect(html).toContain("MiMo Gateway");
    expect(html).toContain("http://127.0.0.1:15721");
    expect(html).toContain("anthropic/MiMo-V2.5-Pro");
    expect(html).toContain("mimo-v2.5-pro");
    expect(html).toContain("local-proxy");
    expect(html).not.toContain("mimo.gateway.token");
  });
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/renderer/components/ProviderGatewayPanel.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement component**

Component props:

```ts
type ProviderGatewayPanelProps = {
  status: ProviderGatewayStatus | null;
  loading: boolean;
  tokenSaving: boolean;
  healthChecking: boolean;
  feedback: string | null;
  error: string | null;
  onRefresh: () => void;
  onSaveToken: (providerId: string, token: string) => Promise<void> | void;
  onRunHealthCheck: () => Promise<void> | void;
  onCopy: (text: string) => void;
};
```

Implementation requirements:

- Use local `tokenDraft` state.
- Token input `type="password"`.
- Submit disabled when no active provider or empty draft.
- After `await onSaveToken(providerId, tokenDraft)`, set `tokenDraft` to `""`.
- Render model mappings as compact rows.
- Render copy buttons for base URL, API key, and model list.
- Render no raw token values.

- [ ] **Step 4: Add i18n keys**

Add Chinese and English keys:

```ts
"providerGateway.title": "Provider Gateway",
"providerGateway.subtitle": "Claude Desktop connects to CodePal here; CodePal owns provider tokens and model mapping.",
"providerGateway.status.local": "Local Gateway",
"providerGateway.status.provider": "Active Provider",
"providerGateway.status.tokenConfigured": "Token configured",
"providerGateway.status.tokenMissing": "Token missing",
"providerGateway.token.title": "Provider Token",
"providerGateway.token.placeholder": "Paste replacement token",
"providerGateway.token.save": "Save token",
"providerGateway.health.run": "Run health check",
"providerGateway.models.title": "Model mappings",
"providerGateway.claude.title": "Claude Desktop setup",
"providerGateway.copyBaseUrl": "Copy base URL",
"providerGateway.copyApiKey": "Copy API key",
"providerGateway.copyModels": "Copy models",
```

Add equivalent Simplified Chinese strings.

- [ ] **Step 5: Run panel test**

Run:

```bash
npm test -- src/renderer/components/ProviderGatewayPanel.test.tsx
```

Expected: PASS.

---

### Task 7: App State And Settings Navigation Reorganization

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/App.test.tsx`
- Modify: `src/renderer/i18n.tsx`

- [ ] **Step 1: Write failing App navigation test**

In `src/renderer/App.test.tsx`, add or update a static render test that expects:

```ts
expect(html).toContain("Provider Gateway");
expect(html).toContain("Agent Integrations");
expect(html).toContain("Usage Accounts");
expect(html).toContain("Preferences");
expect(html).toContain("Advanced");
expect(html).not.toContain("Maintenance & History");
expect(html).not.toContain("Usage & Sign-ins");
```

Use the existing App test render harness.

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
npm test -- src/renderer/App.test.tsx
```

Expected: FAIL because old labels are still present.

- [ ] **Step 3: Add settings section ids**

Change `SettingsSectionId` to:

```ts
type SettingsSectionId =
  | "overview"
  | "providerGateway"
  | "integrations"
  | "usage"
  | "preferences"
  | "advanced";
```

Default active section should be `"overview"`.

- [ ] **Step 4: Add provider gateway state and loaders**

Add state:

```ts
const [providerGatewayStatus, setProviderGatewayStatus] =
  useState<ProviderGatewayStatus | null>(null);
const [providerGatewayLoading, setProviderGatewayLoading] = useState(false);
const [providerGatewayTokenSaving, setProviderGatewayTokenSaving] = useState(false);
const [providerGatewayHealthChecking, setProviderGatewayHealthChecking] = useState(false);
const [providerGatewayFeedback, setProviderGatewayFeedback] = useState<string | null>(null);
const [providerGatewayError, setProviderGatewayError] = useState<string | null>(null);
```

Add functions:

```ts
function loadProviderGatewayStatus() {
  setProviderGatewayLoading(true);
  return window.codepal
    .getProviderGatewayStatus()
    .then((status) => {
      setProviderGatewayStatus(status);
      return status;
    })
    .catch((error: unknown) => {
      setProviderGatewayError((error as Error).message);
      return null;
    })
    .finally(() => {
      setProviderGatewayLoading(false);
    });
}

function saveProviderGatewayToken(providerId: string, token: string) {
  setProviderGatewayTokenSaving(true);
  setProviderGatewayFeedback(null);
  setProviderGatewayError(null);
  return window.codepal
    .updateProviderGatewayToken(providerId, token)
    .then((result) => {
      setProviderGatewayStatus(result.status);
      setProviderGatewayFeedback(i18n.t("providerGateway.token.saved"));
    })
    .catch((error: unknown) => {
      setProviderGatewayError((error as Error).message);
    })
    .finally(() => {
      setProviderGatewayTokenSaving(false);
    });
}

function runProviderGatewayHealthCheck() {
  setProviderGatewayHealthChecking(true);
  setProviderGatewayFeedback(null);
  setProviderGatewayError(null);
  return window.codepal
    .runProviderGatewayHealthCheck()
    .then((status) => {
      setProviderGatewayStatus(status);
      setProviderGatewayFeedback(i18n.t("providerGateway.health.finished"));
    })
    .catch((error: unknown) => {
      setProviderGatewayError((error as Error).message);
    })
    .finally(() => {
      setProviderGatewayHealthChecking(false);
    });
}
```

- [ ] **Step 5: Rebuild settings section list**

Use labels:

```ts
const settingsSections: SettingsSection[] = [
  { id: "overview", label: i18n.t("settings.overview.title"), eyebrow: i18n.t("settings.overview.eyebrow"), summary: i18n.t("settings.overview.summary") },
  { id: "providerGateway", label: i18n.t("providerGateway.title"), eyebrow: i18n.t("settings.providerGateway.eyebrow"), summary: i18n.t("settings.providerGateway.summary") },
  { id: "integrations", label: i18n.t("settings.integrations.title"), eyebrow: i18n.t("settings.integrations.eyebrow"), summary: i18n.t("settings.integrations.summary") },
  { id: "usage", label: i18n.t("settings.usage.title"), eyebrow: i18n.t("settings.usage.eyebrow"), summary: i18n.t("settings.usage.summary") },
  { id: "preferences", label: i18n.t("settings.preferences.title"), eyebrow: i18n.t("settings.preferences.eyebrow"), summary: i18n.t("settings.preferences.summary") },
  { id: "advanced", label: i18n.t("settings.advanced.title"), eyebrow: i18n.t("settings.advanced.eyebrow"), summary: i18n.t("settings.advanced.summary") },
];
```

- [ ] **Step 6: Move panels into new sections**

Render:

- `overview`: compact summary blocks for listener/gateway/attention counts.
- `providerGateway`: `ProviderGatewayPanel`.
- `integrations`: existing `IntegrationPanel`.
- `usage`: existing quota panels; keep enterprise panel gated by `appSettings.codebuddy.enterprise.enabled`.
- `preferences`: `DisplayPreferencesPanel` and `NotificationPreferencesPanel` in one stack.
- `advanced`: `UpdatePanel`, YAML block, `HistorySettingsPanel`, `SupportPanel`.

- [ ] **Step 7: Run App test**

Run:

```bash
npm test -- src/renderer/App.test.tsx
```

Expected: PASS.

---

### Task 8: CSS Polish

**Files:**
- Modify: `src/renderer/styles.css`
- Test: existing render tests plus manual browser inspection.

- [ ] **Step 1: Add gateway-specific CSS**

Add compact styles:

```css
.provider-gateway-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.provider-gateway-panel__status-grid,
.provider-gateway-panel__profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

.provider-gateway-panel__mapping-row,
.provider-gateway-panel__setup-row {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 88%, white 4%);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.provider-gateway-panel__value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text);
}

.provider-gateway-panel__token-form {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.provider-gateway-panel__token-input {
  min-width: 0;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-elevated) 92%, white 3%);
  color: var(--text);
}
```

- [ ] **Step 2: Check responsive behavior**

Ensure existing `@media (max-width: 900px)` stacks gateway rows:

```css
@media (max-width: 900px) {
  .provider-gateway-panel__mapping-row,
  .provider-gateway-panel__setup-row,
  .provider-gateway-panel__token-form {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 3: Run targeted renderer tests**

Run:

```bash
npm test -- src/renderer/components/ProviderGatewayPanel.test.tsx src/renderer/App.test.tsx src/renderer/styles.test.ts
```

Expected: PASS.

---

### Task 9: Full Verification

**Files:**
- No code changes unless verification finds issues.

- [ ] **Step 1: Run focused gateway tests**

Run:

```bash
npm test -- src/main/gateway/claudeDesktopGateway.test.ts src/main/gateway/gatewaySecrets.test.ts src/main/gateway/providerGatewayStatus.test.ts src/main/preload/index.test.ts src/renderer/components/ProviderGatewayPanel.test.tsx src/renderer/App.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full unit suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 3: Run targeted lint on changed files**

Run:

```bash
npx eslint src/shared/providerGatewayTypes.ts src/main/gateway/claudeDesktopGateway.ts src/main/gateway/gatewaySecrets.ts src/main/gateway/providerGatewayStatus.ts src/main/main.ts src/main/preload/index.ts src/renderer/codepal.d.ts src/renderer/components/ProviderGatewayPanel.tsx src/renderer/components/ProviderGatewayPanel.test.tsx src/renderer/App.tsx src/renderer/i18n.tsx --ext .ts,.tsx
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 5: Manual smoke**

Run local app:

```bash
CODEPAL_IPC_PORT=17372 npm run dev
```

Expected:

- Settings opens to Overview.
- Provider Gateway nav item is visible.
- Provider Gateway page shows `http://127.0.0.1:15721`.
- Token state shows configured if `provider-gateway-secrets.json` contains `mimo.gateway.token`.
- Health check completes without exposing token.
- Copy model list returns Claude-side model names.
- Advanced contains YAML, updates, history, and support.

---

## Self-Review Notes

- Spec coverage:
  - Provider Gateway first-class UI: Task 6 and Task 7.
  - Token management without plaintext exposure: Task 2, Task 4, Task 6.
  - Health check and model mapping display: Task 3, Task 4, Task 6.
  - Settings cleanup and Advanced folding: Task 7.
  - Tests and verification: Task 9.
- Scope intentionally excludes multi-protocol provider adapters, HTTPS local endpoint, and editable model mappings.
- Type names are consistent across shared, main, preload, and renderer tasks.
