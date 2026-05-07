import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";

import type {
  AppSettings,
  ProviderGatewayConfig,
  ProviderGatewaySettings,
} from "../../shared/appSettings";
import type { GatewaySecretResolver } from "./gatewaySecrets";

type Logger = {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

type GatewayServerOptions = {
  getSettings: () => AppSettings;
  secrets: GatewaySecretResolver;
  fetchImpl?: typeof fetch;
  logger?: Partial<Logger>;
};

type HealthCheckOptions = {
  settings: AppSettings;
  secrets: GatewaySecretResolver;
  fetchImpl?: typeof fetch;
};

export type ProviderHealthCheckResult = {
  ok: boolean;
  providerId?: string;
  baseUrl?: string;
  tokenConfigured: boolean;
  models: Array<{
    claudeModel: string;
    upstreamModel: string;
    ok: boolean;
    status?: number;
    error?: string;
  }>;
  error?: string;
};

const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const MAX_JSON_BODY_BYTES = 64 * 1024 * 1024;

const defaultLogger: Logger = {
  info: (...args: unknown[]) => console.log(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
};

function jsonResponse(response: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

function anthropicError(status: number, type: string, message: string) {
  return {
    status,
    payload: {
      type: "error",
      error: {
        type,
        message,
      },
    },
  };
}

function openAiError(
  status: number,
  type: string,
  message: string,
  param: string | null = null,
  code: string | null = null,
) {
  return {
    status,
    payload: {
      error: {
        message,
        type,
        param,
        code,
      },
    },
  };
}

function activeProvider(settings: ProviderGatewaySettings): [string, ProviderGatewayConfig] | null {
  const provider = settings.providers[settings.activeProvider];
  return provider ? [settings.activeProvider, provider] : null;
}

function displayNameForModel(id: string): string {
  const modelName = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return modelName.replace(/-/g, " ");
}

function listModels(provider: ProviderGatewayConfig) {
  const data = Object.keys(provider.modelMappings).map((id) => ({
    id,
    type: "model",
    display_name: displayNameForModel(id),
  }));
  return {
    data,
    has_more: false,
    first_id: data[0]?.id ?? null,
    last_id: data[data.length - 1]?.id ?? null,
  };
}

function upstreamUrl(provider: ProviderGatewayConfig, path: string): string {
  return `${provider.baseUrl.replace(/\/$/, "")}${path}`;
}

function getHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_JSON_BODY_BYTES) {
      throw new Error("request body too large");
    }
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) {
    throw new Error("request body is required");
  }
  return JSON.parse(raw) as unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArrayText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const object = asObject(item);
        if (!object) {
          return typeof item === "string" ? item : "";
        }
        const type = typeof object.type === "string" ? object.type : "";
        if (
          type === "input_text" ||
          type === "output_text" ||
          type === "text" ||
          type === ""
        ) {
          return typeof object.text === "string" ? object.text : "";
        }
        if (type === "input_image") {
          return "[image input omitted by CodePal Codex adapter]";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  const object = asObject(value);
  if (object && typeof object.text === "string") {
    return object.text;
  }
  return "";
}

function estimateTokensFromText(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }
  const characterEstimate = Math.ceil(Array.from(normalized).length / 3);
  const wordEstimate = normalized.split(" ").filter(Boolean).length;
  return Math.max(characterEstimate, wordEstimate);
}

function estimateCountTokens(body: Record<string, unknown>): { input_tokens: number } {
  const parts: string[] = [];
  const system = asStringArrayText(body.system);
  if (system) {
    parts.push(system);
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  for (const message of messages) {
    const object = asObject(message);
    if (!object) {
      continue;
    }
    if (typeof object.role === "string") {
      parts.push(object.role);
    }
    const content = asStringArrayText(object.content);
    if (content) {
      parts.push(content);
    }
  }

  const tools = Array.isArray(body.tools) ? body.tools : [];
  for (const tool of tools) {
    const object = asObject(tool);
    if (!object) {
      continue;
    }
    for (const key of ["name", "description"] as const) {
      if (typeof object[key] === "string") {
        parts.push(object[key]);
      }
    }
    if (object.input_schema) {
      parts.push(JSON.stringify(object.input_schema));
    }
  }

  const textTokens = estimateTokensFromText(parts.join("\n"));
  const messageOverhead = Math.max(1, messages.length) * 6;
  return { input_tokens: Math.max(1, textTokens + messageOverhead + 8) };
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function buildForwardHeaders(
  request: IncomingMessage,
  provider: ProviderGatewayConfig,
  token: string,
): Record<string, string> {
  return {
    ...provider.headers,
    authorization: `Bearer ${token}`,
    "anthropic-version": getHeader(request, "anthropic-version") ?? DEFAULT_ANTHROPIC_VERSION,
    "content-type": "application/json",
  };
}

function copyHeaders(upstream: Response, response: ServerResponse) {
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== "content-length" && lower !== "content-encoding") {
      response.setHeader(key, value);
    }
  });
}

async function streamUpstreamResponse(upstream: Response, response: ServerResponse) {
  response.statusCode = upstream.status;
  copyHeaders(upstream, response);
  if (!upstream.body) {
    response.end();
    return;
  }
  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      response.write(Buffer.from(value));
    }
    response.end();
  } catch (error) {
    response.destroy(error instanceof Error ? error : new Error(String(error)));
  }
}

async function proxyTextResponse(
  upstream: Response,
  response: ServerResponse,
  claudeModel: string,
) {
  const text = await upstream.text();
  response.statusCode = upstream.status;
  copyHeaders(upstream, response);
  const contentType = upstream.headers.get("content-type") ?? "";
  if (upstream.ok && contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      const payload = asObject(parsed);
      if (payload && typeof payload.model === "string") {
        payload.model = claudeModel;
        const body = JSON.stringify(payload);
        response.setHeader("content-type", "application/json");
        response.setHeader("content-length", Buffer.byteLength(body));
        response.end(body);
        return;
      }
    } catch {
      // Fall through and proxy the original body if upstream returns non-JSON despite the header.
    }
  }
  response.setHeader("content-length", Buffer.byteLength(text));
  response.end(text);
}

async function handleModels(
  settings: AppSettings,
  response: ServerResponse,
) {
  const selected = activeProvider(settings.providerGateway);
  if (!selected) {
    const error = anthropicError(503, "api_error", "Active provider not configured");
    jsonResponse(response, error.status, error.payload);
    return;
  }
  jsonResponse(response, 200, listModels(selected[1]));
}

function responseId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function codexInputToAnthropic(
  body: Record<string, unknown>,
): { system?: string; messages: Array<{ role: "user" | "assistant"; content: string }> } {
  const systemParts: string[] = [];
  if (typeof body.instructions === "string" && body.instructions.trim()) {
    systemParts.push(body.instructions);
  }
  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const input = body.input;
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      const object = asObject(item);
      if (!object) {
        continue;
      }
      const type = typeof object.type === "string" ? object.type : "";
      const role = typeof object.role === "string" ? object.role : "";
      if (role === "system" || role === "developer") {
        const text = asStringArrayText(object.content);
        if (text) {
          systemParts.push(text);
        }
        continue;
      }
      if (type === "function_call_output") {
        const output = asStringArrayText(object.output);
        if (output) {
          messages.push({
            role: "user",
            content: `Tool result${typeof object.call_id === "string" ? ` ${object.call_id}` : ""}:\n${output}`,
          });
        }
        continue;
      }
      if (role === "user" || role === "assistant") {
        const text = asStringArrayText(object.content);
        if (text) {
          messages.push({ role, content: text });
        }
      }
    }
  }
  return {
    system: systemParts.length ? systemParts.join("\n\n") : undefined,
    messages: messages.length ? messages : [{ role: "user", content: "." }],
  };
}

function anthropicContentText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => {
      const object = asObject(item);
      if (!object) {
        return "";
      }
      return object.type === "text" && typeof object.text === "string" ? object.text : "";
    })
    .filter(Boolean)
    .join("");
}

function codexResponseFromAnthropic(payload: Record<string, unknown>, claudeModel: string) {
  const outputText = anthropicContentText(payload.content);
  const usage = asObject(payload.usage);
  const inputTokens = positiveInteger(usage?.input_tokens, 0);
  const outputTokens = positiveInteger(usage?.output_tokens, 0);
  const createdAt = Math.floor(Date.now() / 1000);
  const messageId = typeof payload.id === "string" ? payload.id : responseId("msg");
  return {
    id: responseId("resp"),
    object: "response",
    created_at: createdAt,
    status: "completed",
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: claudeModel,
    output: [
      {
        id: messageId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: outputText,
            annotations: [],
          },
        ],
      },
    ],
    output_text: outputText,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
}

async function proxyCodexTextResponse(
  upstream: Response,
  response: ServerResponse,
  claudeModel: string,
) {
  const text = await upstream.text();
  if (!upstream.ok) {
    response.statusCode = upstream.status;
    copyHeaders(upstream, response);
    response.setHeader("content-length", Buffer.byteLength(text));
    response.end(text);
    return;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    const payload = asObject(parsed);
    if (!payload) {
      throw new Error("upstream JSON object expected");
    }
    jsonResponse(response, upstream.status, codexResponseFromAnthropic(payload, claudeModel));
  } catch {
    const error = openAiError(502, "api_error", "Invalid upstream response");
    jsonResponse(response, error.status, error.payload);
  }
}

function writeSse(response: ServerResponse, event: string, data: unknown) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function streamCodexResponseFromAnthropic(
  upstream: Response,
  response: ServerResponse,
  claudeModel: string,
) {
  if (!upstream.ok) {
    await streamUpstreamResponse(upstream, response);
    return;
  }
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  if (!upstream.body) {
    response.end();
    return;
  }
  const createdAt = Math.floor(Date.now() / 1000);
  const id = responseId("resp");
  const outputId = responseId("msg");
  let outputText = "";
  let initialized = false;
  let completed = false;
  const emitStart = () => {
    if (initialized) {
      return;
    }
    initialized = true;
    writeSse(response, "response.created", {
      type: "response.created",
      response: {
        id,
        object: "response",
        created_at: createdAt,
        status: "in_progress",
        model: claudeModel,
        output: [],
      },
    });
    writeSse(response, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: 0,
      item: {
        id: outputId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    });
    writeSse(response, "response.content_part.added", {
      type: "response.content_part.added",
      item_id: outputId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    });
  };
  const emitComplete = () => {
    if (completed) {
      return;
    }
    emitStart();
    completed = true;
    writeSse(response, "response.output_text.done", {
      type: "response.output_text.done",
      item_id: outputId,
      output_index: 0,
      content_index: 0,
      text: outputText,
    });
    writeSse(response, "response.content_part.done", {
      type: "response.content_part.done",
      item_id: outputId,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: outputText, annotations: [] },
    });
    writeSse(response, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: 0,
      item: {
        id: outputId,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: outputText, annotations: [] }],
      },
    });
    writeSse(response, "response.completed", {
      type: "response.completed",
      response: {
        id,
        object: "response",
        created_at: createdAt,
        status: "completed",
        model: claudeModel,
        output_text: outputText,
      },
    });
  };
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\n\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split(/\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") {
          continue;
        }
        const event = JSON.parse(data) as unknown;
        const object = asObject(event);
        if (!object) {
          continue;
        }
        if (object.type === "message_stop") {
          emitComplete();
          continue;
        }
        const delta = asObject(object.delta);
        if (delta?.type === "text_delta" && typeof delta.text === "string") {
          emitStart();
          outputText += delta.text;
          writeSse(response, "response.output_text.delta", {
            type: "response.output_text.delta",
            item_id: outputId,
            output_index: 0,
            content_index: 0,
            delta: delta.text,
          });
        }
      }
    }
    emitComplete();
    response.end();
  } catch (error) {
    response.destroy(error instanceof Error ? error : new Error(String(error)));
  }
}

async function handleMessages(
  request: IncomingMessage,
  response: ServerResponse,
  settings: AppSettings,
  secrets: GatewaySecretResolver,
  fetchImpl: typeof fetch,
  logger: Logger,
  path: "/v1/messages" | "/v1/messages/count_tokens",
) {
  const startedAt = Date.now();
  const selected = activeProvider(settings.providerGateway);
  if (!selected) {
    const error = anthropicError(503, "api_error", "Active provider not configured");
    jsonResponse(response, error.status, error.payload);
    return;
  }
  const [providerId, provider] = selected;
  let claudeModel = "";
  let upstreamModel = "";
  let isStream = false;
  try {
    const parsed = await readJsonBody(request);
    const body = asObject(parsed);
    if (!body) {
      const error = anthropicError(400, "invalid_request_error", "JSON object body is required");
      jsonResponse(response, error.status, error.payload);
      return;
    }
    claudeModel = typeof body.model === "string" ? body.model : "";
    upstreamModel = provider.modelMappings[claudeModel] ?? "";
    if (!upstreamModel) {
      const error = anthropicError(
        400,
        "invalid_request_error",
        `Unsupported model: ${claudeModel || "<missing>"}`,
      );
      jsonResponse(response, error.status, error.payload);
      return;
    }
    if (path === "/v1/messages/count_tokens") {
      const durationMs = Date.now() - startedAt;
      logger.info(
        `[CodePal Gateway] ${request.method ?? "GET"} ${path} provider=${providerId} model=${claudeModel} -> ${upstreamModel} status=200 durationMs=${durationMs} stream=false local=count_tokens`,
      );
      jsonResponse(response, 200, estimateCountTokens(body));
      return;
    }
    const token = secrets.resolveToken(provider);
    if (!token) {
      const error = anthropicError(503, "authentication_error", "Provider token not configured");
      jsonResponse(response, error.status, error.payload);
      return;
    }
    isStream = body.stream === true;
    const upstreamBody = {
      ...body,
      model: upstreamModel,
    };
    const upstream = await fetchImpl(upstreamUrl(provider, path), {
      method: "POST",
      headers: buildForwardHeaders(request, provider, token),
      body: JSON.stringify(upstreamBody),
    });
    const durationMs = Date.now() - startedAt;
    logger.info(
      `[CodePal Gateway] ${request.method ?? "GET"} ${path} provider=${providerId} model=${claudeModel} -> ${upstreamModel} status=${upstream.status} durationMs=${durationMs} stream=${isStream}`,
    );
    if (isStream) {
      await streamUpstreamResponse(upstream, response);
      return;
    }
    await proxyTextResponse(upstream, response, claudeModel);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.warn(
      `[CodePal Gateway] ${request.method ?? "GET"} ${path} model=${claudeModel || "<unknown>"} -> ${upstreamModel || "<unknown>"} status=error durationMs=${durationMs} stream=${isStream} error=${error instanceof Error ? error.message : String(error)}`,
    );
    const apiError = anthropicError(400, "invalid_request_error", "Invalid JSON request body");
    jsonResponse(response, apiError.status, apiError.payload);
  }
}

async function handleCodexResponses(
  request: IncomingMessage,
  response: ServerResponse,
  settings: AppSettings,
  secrets: GatewaySecretResolver,
  fetchImpl: typeof fetch,
  logger: Logger,
) {
  const startedAt = Date.now();
  const selected = activeProvider(settings.providerGateway);
  if (!selected) {
    const error = openAiError(503, "api_error", "Active provider not configured");
    jsonResponse(response, error.status, error.payload);
    return;
  }
  const [providerId, provider] = selected;
  let claudeModel = "";
  let upstreamModel = "";
  let isStream = false;
  try {
    const parsed = await readJsonBody(request);
    const body = asObject(parsed);
    if (!body) {
      const error = openAiError(400, "invalid_request_error", "JSON object body is required");
      jsonResponse(response, error.status, error.payload);
      return;
    }
    claudeModel = typeof body.model === "string" ? body.model : "";
    upstreamModel = provider.modelMappings[claudeModel] ?? "";
    if (!upstreamModel) {
      const error = openAiError(
        400,
        "invalid_request_error",
        `Unsupported model: ${claudeModel || "<missing>"}`,
        "model",
        "unsupported_model",
      );
      jsonResponse(response, error.status, error.payload);
      return;
    }
    const token = secrets.resolveToken(provider);
    if (!token) {
      const error = openAiError(503, "authentication_error", "Provider token not configured");
      jsonResponse(response, error.status, error.payload);
      return;
    }
    isStream = body.stream === true;
    const anthropicInput = codexInputToAnthropic(body);
    const upstreamBody: Record<string, unknown> = {
      model: upstreamModel,
      max_tokens: positiveInteger(body.max_output_tokens ?? body.max_tokens, 4096),
      ...anthropicInput,
    };
    if (isStream) {
      upstreamBody.stream = true;
    }
    const upstream = await fetchImpl(upstreamUrl(provider, "/v1/messages"), {
      method: "POST",
      headers: buildForwardHeaders(request, provider, token),
      body: JSON.stringify(upstreamBody),
    });
    const durationMs = Date.now() - startedAt;
    logger.info(
      `[CodePal Gateway] ${request.method ?? "GET"} /v1/responses provider=${providerId} model=${claudeModel} -> ${upstreamModel} status=${upstream.status} durationMs=${durationMs} stream=${isStream}`,
    );
    if (isStream) {
      await streamCodexResponseFromAnthropic(upstream, response, claudeModel);
      return;
    }
    await proxyCodexTextResponse(upstream, response, claudeModel);
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    logger.warn(
      `[CodePal Gateway] ${request.method ?? "GET"} /v1/responses model=${claudeModel || "<unknown>"} -> ${upstreamModel || "<unknown>"} status=error durationMs=${durationMs} stream=${isStream} error=${error instanceof Error ? error.message : String(error)}`,
    );
    const apiError = openAiError(400, "invalid_request_error", "Invalid JSON request body");
    jsonResponse(response, apiError.status, apiError.payload);
  }
}

export function createClaudeDesktopGatewayServer(options: GatewayServerOptions): http.Server {
  const logger = { ...defaultLogger, ...(options.logger ?? {}) };
  const fetchImpl = options.fetchImpl ?? fetch;
  return http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const settings = options.getSettings();
    if (!settings.providerGateway.enabled) {
      const error = anthropicError(503, "api_error", "Provider gateway disabled");
      jsonResponse(response, error.status, error.payload);
      return;
    }
    void (async () => {
      if (request.method === "GET" && url.pathname === "/v1/models") {
        await handleModels(settings, response);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/messages") {
        await handleMessages(
          request,
          response,
          settings,
          options.secrets,
          fetchImpl,
          logger,
          "/v1/messages",
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/messages/count_tokens") {
        await handleMessages(
          request,
          response,
          settings,
          options.secrets,
          fetchImpl,
          logger,
          "/v1/messages/count_tokens",
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/responses") {
        await handleCodexResponses(
          request,
          response,
          settings,
          options.secrets,
          fetchImpl,
          logger,
        );
        return;
      }
      const error = anthropicError(404, "not_found_error", "Not found");
      jsonResponse(response, error.status, error.payload);
    })().catch((error: unknown) => {
      logger.error(
        "[CodePal Gateway] unhandled request error:",
        error instanceof Error ? error.message : String(error),
      );
      const apiError = anthropicError(500, "api_error", "Gateway request failed");
      jsonResponse(response, apiError.status, apiError.payload);
    });
  });
}

export async function runProviderHealthCheck(
  options: HealthCheckOptions,
): Promise<ProviderHealthCheckResult> {
  const selected = activeProvider(options.settings.providerGateway);
  if (!selected) {
    return {
      ok: false,
      tokenConfigured: false,
      models: [],
      error: "Active provider not configured",
    };
  }
  const [providerId, provider] = selected;
  const token = options.secrets.resolveToken(provider);
  if (!token) {
    return {
      ok: false,
      providerId,
      baseUrl: provider.baseUrl,
      tokenConfigured: false,
      models: [],
      error: "Provider token not configured",
    };
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const models: ProviderHealthCheckResult["models"] = [];
  for (const [claudeModel, upstreamModel] of Object.entries(provider.modelMappings)) {
    try {
      const response = await fetchImpl(upstreamUrl(provider, "/v1/messages"), {
        method: "POST",
        headers: {
          ...provider.headers,
          authorization: `Bearer ${token}`,
          "anthropic-version": DEFAULT_ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: upstreamModel,
          max_tokens: 1,
          messages: [{ role: "user", content: "." }],
        }),
      });
      models.push({
        claudeModel,
        upstreamModel,
        ok: response.ok,
        status: response.status,
      });
    } catch (error) {
      models.push({
        claudeModel,
        upstreamModel,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return {
    ok: models.every((model) => model.ok),
    providerId,
    baseUrl: provider.baseUrl,
    tokenConfigured: true,
    models,
  };
}
