import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import type {
  ProviderGatewayClientSetupStatus,
  ProviderGatewayStatus,
} from "../../shared/providerGatewayTypes";

export type ProviderGatewayClientSetupTarget =
  | "claude-desktop"
  | "claude-desktop-restore"
  | "codex-desktop"
  | "codex-desktop-restore";

export type ProviderGatewayClientSetupResult = {
  ok: boolean;
  target: ProviderGatewayClientSetupTarget;
  changed: boolean;
  configPath: string;
  backupPath?: string;
  message: string;
};

type ProviderGatewayClientSetupOptions = {
  target: ProviderGatewayClientSetupTarget;
  status: ProviderGatewayStatus;
  homeDir: string;
  now?: () => number;
};

const CODEX_PROVIDER_BLOCK_START = "# BEGIN CODEPAL PROVIDER GATEWAY";
const CODEX_PROVIDER_BLOCK_END = "# END CODEPAL PROVIDER GATEWAY";
const CLAUDE_CONFIG_NAME = "CodePal Gateway";

type ClaudeConfigMetaEntry = {
  id: string;
  name: string;
};

type ClaudeConfigMeta = {
  appliedId?: string;
  codePalPreviousAppliedId?: string | null;
  entries?: ClaudeConfigMetaEntry[];
};

type CodexGatewayRestoreState = {
  previousModel?: string | null;
  previousModelProvider?: string | null;
  savedAt: number;
};

function backupFile(filePath: string, now: () => number): string {
  const backupPath = `${filePath}.bak.${now()}`;
  fs.copyFileSync(filePath, backupPath);
  return backupPath;
}

function writeTextIfChanged(filePath: string, contents: string, now: () => number) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null;
  if (previous === contents) {
    return { changed: false };
  }
  const backupPath = previous === null ? undefined : backupFile(filePath, now);
  fs.writeFileSync(filePath, contents, "utf8");
  return { changed: true, backupPath };
}

function writeJsonIfChanged(filePath: string, payload: unknown, now: () => number) {
  return writeTextIfChanged(filePath, `${JSON.stringify(payload, null, 2)}\n`, now);
}

function claudeConfigLibraryDir(homeDir: string): string {
  return path.join(homeDir, "Library", "Application Support", "Claude-3p", "configLibrary");
}

function claudeMetaPath(homeDir: string): string {
  return path.join(claudeConfigLibraryDir(homeDir), "_meta.json");
}

function readClaudeMeta(homeDir: string): ClaudeConfigMeta {
  const metaPath = claudeMetaPath(homeDir);
  if (!fs.existsSync(metaPath)) {
    return {};
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as ClaudeConfigMeta) : {};
  } catch {
    return {};
  }
}

function claudeConfigPathForId(homeDir: string, id: string): string {
  return path.join(claudeConfigLibraryDir(homeDir), `${id}.json`);
}

function claudeConfigId(configPath: string): string {
  return path.basename(configPath, ".json");
}

function claudeConfigProviderForId(homeDir: string, id: string): string | null {
  const configPath = claudeConfigPathForId(homeDir, id);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
    if (parsed && typeof parsed === "object") {
      const provider = (parsed as Record<string, unknown>).inferenceProvider;
      return typeof provider === "string" ? provider : null;
    }
  } catch {
    return null;
  }
  return null;
}

function findClaudeConfigPath(homeDir: string, status: ProviderGatewayStatus): string {
  const configDir = claudeConfigLibraryDir(homeDir);
  const meta = readClaudeMeta(homeDir);
  const codepalEntry = meta.entries?.find((entry) => entry.name === CLAUDE_CONFIG_NAME);
  if (codepalEntry) {
    return claudeConfigPathForId(homeDir, codepalEntry.id);
  }
  if (!fs.existsSync(configDir)) {
    return path.join(configDir, `${randomUUID()}.json`);
  }
  const candidates = fs
    .readdirSync(configDir)
    .filter((entry) => entry.endsWith(".json") && entry !== "_meta.json")
    .map((entry) => path.join(configDir, entry));
  const existingCodepalConfig = candidates.find((candidate) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8")) as unknown;
      return isClaudeConfigCurrent(parsed, status);
    } catch {
      return false;
    }
  });
  return existingCodepalConfig ?? path.join(configDir, `${randomUUID()}.json`);
}

function claudeConfigPayload(status: ProviderGatewayStatus) {
  return {
    inferenceProvider: "gateway",
    inferenceGatewayBaseUrl: status.claudeDesktop.baseUrl,
    inferenceGatewayApiKey: status.claudeDesktop.apiKey,
    inferenceGatewayAuthScheme: status.claudeDesktop.authScheme,
    disableDeploymentModeChooser: false,
    inferenceModels: status.claudeDesktop.inferenceModels,
  };
}

function isClaudeConfigCurrent(candidate: unknown, status: ProviderGatewayStatus): boolean {
  const object = candidate && typeof candidate === "object"
    ? (candidate as Record<string, unknown>)
    : null;
  if (!object) {
    return false;
  }
  const expected = claudeConfigPayload(status);
  return (
    object.inferenceProvider === expected.inferenceProvider &&
    object.inferenceGatewayBaseUrl === expected.inferenceGatewayBaseUrl &&
    object.inferenceGatewayApiKey === expected.inferenceGatewayApiKey &&
    object.inferenceGatewayAuthScheme === expected.inferenceGatewayAuthScheme &&
    JSON.stringify(object.inferenceModels) === JSON.stringify(expected.inferenceModels)
  );
}

function configureClaudeDesktop(
  status: ProviderGatewayStatus,
  homeDir: string,
  now: () => number,
): ProviderGatewayClientSetupResult {
  const configPath = findClaudeConfigPath(homeDir, status);
  const payload = claudeConfigPayload(status);
  const writeResult = writeJsonIfChanged(configPath, payload, now);
  const metaChanged = upsertClaudeMetaEntry(homeDir, claudeConfigId(configPath), CLAUDE_CONFIG_NAME, now, true);
  return {
    ok: true,
    target: "claude-desktop",
    changed: writeResult.changed || metaChanged,
    configPath,
    backupPath: writeResult.backupPath,
    message: writeResult.changed || metaChanged
      ? "Claude Desktop CodePal Gateway profile updated and activated. Restart Claude Desktop if it is already open."
      : "Claude Desktop CodePal Gateway profile is active and already up to date.",
  };
}

function upsertClaudeMetaEntry(
  homeDir: string,
  id: string,
  name: string,
  now: () => number,
  activate: boolean,
): boolean {
  const metaPath = claudeMetaPath(homeDir);
  const current = readClaudeMeta(homeDir);
  const entries = current.entries ?? [];
  const nextEntries = entries.some((entry) => entry.id === id)
    ? entries.map((entry) => (entry.id === id ? { ...entry, name } : entry))
    : [...entries, { id, name }];
  const next: ClaudeConfigMeta = {
    ...current,
    appliedId: activate ? id : current.appliedId ?? id,
    entries: nextEntries,
  };
  if (activate && current.appliedId !== id) {
    next.codePalPreviousAppliedId = current.appliedId ?? null;
  }
  return writeJsonIfChanged(metaPath, next, now).changed;
}

function restoreClaudeDesktop(
  status: ProviderGatewayStatus,
  homeDir: string,
  now: () => number,
): ProviderGatewayClientSetupResult {
  const configPath = findClaudeConfigPath(homeDir, status);
  const metaPath = claudeMetaPath(homeDir);
  const current = readClaudeMeta(homeDir);
  const hasPrevious = Object.prototype.hasOwnProperty.call(current, "codePalPreviousAppliedId");
  const next: ClaudeConfigMeta = { ...current };
  if (hasPrevious) {
    const previousProvider = current.codePalPreviousAppliedId
      ? claudeConfigProviderForId(homeDir, current.codePalPreviousAppliedId)
      : null;
    if (current.codePalPreviousAppliedId && previousProvider && previousProvider !== "gateway") {
      next.appliedId = current.codePalPreviousAppliedId;
    } else {
      delete next.appliedId;
    }
    delete next.codePalPreviousAppliedId;
  }
  const previousText = fs.existsSync(metaPath) ? fs.readFileSync(metaPath, "utf8") : "";
  writeJsonIfChanged(metaPath, next, now);
  return {
    ok: true,
    target: "claude-desktop-restore",
    changed: hasPrevious && previousText !== `${JSON.stringify(next, null, 2)}\n`,
    configPath,
    message: hasPrevious
      ? "Claude Desktop restored to the previous provider selection. Restart Claude Desktop to reload it."
      : "Claude Desktop has no saved previous provider selection to restore.",
  };
}

function codexConfigPath(homeDir: string): string {
  return path.join(homeDir, ".codex", "config.toml");
}

function codexGatewayRestoreStatePath(homeDir: string): string {
  return path.join(homeDir, ".codex", "codepal-provider-gateway-state.json");
}

function readCodexGatewayRestoreState(homeDir: string): CodexGatewayRestoreState | null {
  const statePath = codexGatewayRestoreStatePath(homeDir);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as CodexGatewayRestoreState) : null;
  } catch {
    return null;
  }
}

function writeCodexGatewayRestoreState(
  homeDir: string,
  state: CodexGatewayRestoreState,
  now: () => number,
): void {
  writeJsonIfChanged(codexGatewayRestoreStatePath(homeDir), state, now);
}

function deleteCodexGatewayRestoreState(homeDir: string): void {
  const statePath = codexGatewayRestoreStatePath(homeDir);
  if (fs.existsSync(statePath)) {
    fs.rmSync(statePath);
  }
}

function removeManagedCodexBlock(contents: string): string {
  const pattern = new RegExp(
    `\\n?${CODEX_PROVIDER_BLOCK_START}[\\s\\S]*?${CODEX_PROVIDER_BLOCK_END}\\n?`,
    "g",
  );
  return contents.replace(pattern, "\n").replace(/\n{3,}/g, "\n\n");
}

function stripLegacyCodexRootDefaults(contents: string, status: ProviderGatewayStatus): string {
  const lines = contents.split(/\n/);
  const firstSection = lines.findIndex((line) => /^\s*\[/.test(line));
  const rootEnd = firstSection === -1 ? lines.length : firstSection;
  const rootLines = lines.slice(0, rootEnd);
  const restLines = lines.slice(rootEnd);
  const legacyProvider = rootLines.some((line) => /^\s*model_provider\s*=\s*"codepal"\s*$/.test(line));
  if (!legacyProvider) {
    return contents;
  }
  const managedModels = new Set(status.claudeDesktop.inferenceModels);
  const cleanedRoot = rootLines.filter((line) => {
    if (/^\s*model_provider\s*=\s*"codepal"\s*$/.test(line)) {
      return false;
    }
    const modelMatch = line.match(/^\s*model\s*=\s*"([^"]+)"\s*$/);
    return !(modelMatch && managedModels.has(modelMatch[1]));
  });
  return [...cleanedRoot, ...restLines].join("\n").replace(/\n{3,}/g, "\n\n");
}

function codexRootRange(contents: string): { lines: string[]; rootEnd: number } {
  const lines = contents.split(/\n/);
  const firstSection = lines.findIndex((line) => /^\s*\[/.test(line));
  return { lines, rootEnd: firstSection === -1 ? lines.length : firstSection };
}

function codexRootValue(contents: string, key: "model" | "model_provider"): string | null {
  const { lines, rootEnd } = codexRootRange(contents);
  for (const line of lines.slice(0, rootEnd)) {
    const match = line.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"\\s*$`));
    if (match) {
      return match[1];
    }
  }
  return null;
}

function setCodexRootValue(
  contents: string,
  key: "model" | "model_provider",
  value: string | null,
): string {
  const { lines, rootEnd } = codexRootRange(contents);
  let replaced = false;
  const rootLines = lines.slice(0, rootEnd).filter((line) => {
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      if (value !== null && !replaced) {
        replaced = true;
        return true;
      }
      return false;
    }
    return true;
  });
  if (value !== null) {
    const nextLine = `${key} = "${value}"`;
    if (replaced) {
      const index = rootLines.findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
      rootLines[index] = nextLine;
    } else {
      rootLines.unshift(nextLine);
    }
  }
  return [...rootLines, ...lines.slice(rootEnd)].join("\n").replace(/\n{3,}/g, "\n\n");
}

function isCodexGatewayActive(contents: string, status: ProviderGatewayStatus): boolean {
  const modelProvider = codexRootValue(contents, "model_provider");
  const model = codexRootValue(contents, "model");
  return modelProvider === "codepal" && Boolean(model && status.claudeDesktop.inferenceModels.includes(model));
}

function stripCodexGatewayRootDefaults(contents: string, status: ProviderGatewayStatus): string {
  if (!isCodexGatewayActive(contents, status)) {
    return contents;
  }
  return setCodexRootValue(setCodexRootValue(contents, "model_provider", null), "model", null);
}

function codexProviderBlock(status: ProviderGatewayStatus): string {
  const model = status.claudeDesktop.inferenceModels[0] ?? "anthropic/MiMo-V2.5-Pro";
  return [
    CODEX_PROVIDER_BLOCK_START,
    "[model_providers.codepal]",
    'name = "CodePal Gateway"',
    `base_url = "${status.listener.localUrl.replace(/\/$/, "")}/v1"`,
    'wire_api = "responses"',
    "requires_openai_auth = false",
    'http_headers = { Authorization = "Bearer local-proxy" }',
    "",
    "[profiles.codepal-mimo]",
    `model = "${model}"`,
    'model_provider = "codepal"',
    CODEX_PROVIDER_BLOCK_END,
    "",
  ].join("\n");
}

export function codexConfigContents(current: string, status: ProviderGatewayStatus): string {
  const withoutManagedBlock = removeManagedCodexBlock(current);
  const withoutLegacyGlobalDefaults = stripLegacyCodexRootDefaults(withoutManagedBlock, status).trimEnd();
  return `${withoutLegacyGlobalDefaults ? `${withoutLegacyGlobalDefaults}\n\n` : ""}${codexProviderBlock(status)}`;
}

function isCodexConfigCurrent(current: string, status: ProviderGatewayStatus): boolean {
  const withoutActiveRoot = stripCodexGatewayRootDefaults(current, status);
  return codexConfigContents(withoutActiveRoot, status) === withoutActiveRoot;
}

function configureCodexDesktop(
  status: ProviderGatewayStatus,
  homeDir: string,
  now: () => number,
): ProviderGatewayClientSetupResult {
  const configPath = codexConfigPath(homeDir);
  const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const model = status.claudeDesktop.inferenceModels[0] ?? "anthropic/MiMo-V2.5-Pro";
  if (!isCodexGatewayActive(previous, status)) {
    writeCodexGatewayRestoreState(
      homeDir,
      {
        previousModel: codexRootValue(previous, "model"),
        previousModelProvider: codexRootValue(previous, "model_provider"),
        savedAt: now(),
      },
      now,
    );
  }
  const profileContents = codexConfigContents(previous, status);
  const next = setCodexRootValue(
    setCodexRootValue(profileContents, "model", model),
    "model_provider",
    "codepal",
  );
  const writeResult = writeTextIfChanged(configPath, next, now);
  return {
    ok: true,
    target: "codex-desktop",
    changed: writeResult.changed,
    configPath,
    backupPath: writeResult.backupPath,
    message: writeResult.changed
      ? "Codex Desktop switched to CodePal Gateway. Restart Codex Desktop to reload config."
      : "Codex Desktop is already switched to CodePal Gateway.",
  };
}

function restoreCodexDesktop(
  status: ProviderGatewayStatus,
  homeDir: string,
  now: () => number,
): ProviderGatewayClientSetupResult {
  const configPath = codexConfigPath(homeDir);
  const previous = fs.existsSync(configPath) ? fs.readFileSync(configPath, "utf8") : "";
  const state = readCodexGatewayRestoreState(homeDir);
  let next = codexConfigContents(stripCodexGatewayRootDefaults(previous, status), status);
  if (state) {
    next = setCodexRootValue(next, "model", state.previousModel ?? null);
    next = setCodexRootValue(next, "model_provider", state.previousModelProvider ?? null);
  }
  const writeResult = writeTextIfChanged(configPath, next, now);
  if (state) {
    deleteCodexGatewayRestoreState(homeDir);
  }
  return {
    ok: true,
    target: "codex-desktop-restore",
    changed: writeResult.changed,
    configPath,
    backupPath: writeResult.backupPath,
    message: state
      ? "Codex Desktop restored to the previous default provider. Restart Codex Desktop to reload config."
      : "Codex Desktop has no saved previous provider to restore.",
  };
}

export function configureProviderGatewayClient(
  options: ProviderGatewayClientSetupOptions,
): ProviderGatewayClientSetupResult {
  const now = options.now ?? Date.now;
  if (options.target === "claude-desktop") {
    return configureClaudeDesktop(options.status, options.homeDir, now);
  }
  if (options.target === "claude-desktop-restore") {
    return restoreClaudeDesktop(options.status, options.homeDir, now);
  }
  if (options.target === "codex-desktop-restore") {
    return restoreCodexDesktop(options.status, options.homeDir, now);
  }
  return configureCodexDesktop(options.status, options.homeDir, now);
}

export function inspectProviderGatewayClientSetup(options: {
  target: ProviderGatewayClientSetupTarget;
  status: ProviderGatewayStatus;
  homeDir: string;
}): ProviderGatewayClientSetupStatus {
  if (options.target === "claude-desktop") {
    const configPath = findClaudeConfigPath(options.homeDir, options.status);
    if (!fs.existsSync(configPath)) {
      return {
        configured: false,
        configPath,
        restartRequired: false,
        message: "Claude Desktop gateway configuration has not been written yet.",
      };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
      const configured = isClaudeConfigCurrent(parsed, options.status);
      const meta = readClaudeMeta(options.homeDir);
      const active = configured && meta.appliedId === claudeConfigId(configPath);
      const canRestore = Object.prototype.hasOwnProperty.call(meta, "codePalPreviousAppliedId");
      return {
        configured,
        active,
        canRestore,
        configPath,
        restartRequired: configured,
        message: configured
          ? active
            ? "Configured and active. Restart Claude Desktop to make sure it reloads this gateway profile. Use Restore to switch back to the previous provider."
            : "Configured but not active. Click Configure Claude to switch Claude Desktop to CodePal Gateway."
          : "Claude Desktop config exists but does not match current CodePal Gateway settings.",
      };
    } catch {
      return {
        configured: false,
        configPath,
        restartRequired: false,
        message: "Claude Desktop config exists but is not valid JSON.",
      };
    }
  }
  const configPath = codexConfigPath(options.homeDir);
  if (!fs.existsSync(configPath)) {
    return {
      configured: false,
      configPath,
      restartRequired: false,
      message: "Codex config.toml has not been written yet.",
    };
  }
  const contents = fs.readFileSync(configPath, "utf8");
  const configured = isCodexConfigCurrent(contents, options.status);
  const active = isCodexGatewayActive(contents, options.status);
  const canRestore = Boolean(readCodexGatewayRestoreState(options.homeDir));
  return {
    configured,
    active,
    canRestore,
    configPath,
    restartRequired: configured,
    message: configured
      ? active
        ? "Configured and active. Restart Codex Desktop to reload CodePal Gateway. Use Restore to switch back to the previous default provider."
        : "Configured but not active. Click Configure Codex to switch Codex Desktop to CodePal Gateway."
      : "Codex config.toml exists but does not match current CodePal Gateway settings.",
  };
}
