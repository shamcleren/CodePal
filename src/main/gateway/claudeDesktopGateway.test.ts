import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAppSettings } from "../../shared/appSettings";
import { createClaudeDesktopGatewayServer, runProviderHealthCheck } from "./claudeDesktopGateway";
import type { GatewaySecretResolver } from "./gatewaySecrets";

type FetchCall = {
  url: string;
  init: RequestInit;
};

class TestServerResponse {
  statusCode = 200;
  private readonly headers = new Headers();
  private readonly chunks: Buffer[] = [];
  private ended = false;
  private resolve!: (response: Response) => void;
  private reject!: (error: Error) => void;
  readonly done: Promise<Response>;

  constructor() {
    this.done = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  setHeader(name: string, value: number | string | string[]) {
    this.headers.set(name, Array.isArray(value) ? value.join(", ") : String(value));
  }

  getHeader(name: string) {
    return this.headers.get(name) ?? undefined;
  }

  writeHead(statusCode: number, headers?: Record<string, number | string | string[]>) {
    this.statusCode = statusCode;
    for (const [name, value] of Object.entries(headers ?? {})) {
      this.setHeader(name, value);
    }
  }

  write(chunk: string | Uint8Array) {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }

  end(chunk?: string | Uint8Array) {
    if (this.ended) {
      return;
    }
    if (chunk) {
      this.write(chunk);
    }
    this.ended = true;
    this.resolve(new Response(Buffer.concat(this.chunks), {
      status: this.statusCode,
      headers: this.headers,
    }));
  }

  destroy(error?: Error) {
    this.reject(error ?? new Error("Gateway response destroyed"));
  }
}

function createRequest(path: string, init: RequestInit = {}): IncomingMessage {
  const body = typeof init.body === "string" ? [Buffer.from(init.body)] : [];
  const request = Readable.from(body) as IncomingMessage;
  request.method = init.method ?? "GET";
  request.url = path;
  request.headers = Object.fromEntries(new Headers(init.headers).entries());
  return request;
}

async function requestGateway(
  server: http.Server,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = new TestServerResponse();
  server.emit("request", createRequest(path, init), response as unknown as ServerResponse);
  return response.done;
}

function createTestGateway(options: {
  token?: string;
  fetchImpl?: typeof fetch;
  log?: (...args: unknown[]) => void;
}) {
  const settings = normalizeAppSettings({});
  const secrets: GatewaySecretResolver = {
    resolveToken: vi.fn(() => options.token ?? ""),
  };
  return createClaudeDesktopGatewayServer({
    getSettings: () => settings,
    secrets,
    fetchImpl: options.fetchImpl,
    logger: {
      info: options.log ?? vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.runIf(process.env.VITEST_CAN_LISTEN !== "false")("claude desktop gateway", () => {
  it("returns Anthropic-style model ids from the active provider mapping", async () => {
    const server = createTestGateway({ token: "secret" });
    const response = await requestGateway(server, "/v1/models");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "anthropic/MiMo-V2.5-Pro",
          type: "model",
          display_name: "MiMo V2.5 Pro",
        },
        {
          id: "anthropic/MiMo-V2.5",
          type: "model",
          display_name: "MiMo V2.5",
        },
        {
          id: "anthropic/MiMo-V2-Pro",
          type: "model",
          display_name: "MiMo V2 Pro",
        },
        {
          id: "anthropic/MiMo-V2-Omni",
          type: "model",
          display_name: "MiMo V2 Omni",
        },
        {
          id: "default",
          type: "model",
          display_name: "default",
        },
        {
          id: "sonnet",
          type: "model",
          display_name: "sonnet",
        },
        {
          id: "opus",
          type: "model",
          display_name: "opus",
        },
        {
          id: "claude-sonnet-4-6",
          type: "model",
          display_name: "claude sonnet 4 6",
        },
        {
          id: "claude-opus-4-7",
          type: "model",
          display_name: "claude opus 4 7",
        },
        {
          id: "claude-haiku-4-5",
          type: "model",
          display_name: "claude haiku 4 5",
        },
      ],
      has_more: false,
      first_id: "anthropic/MiMo-V2.5-Pro",
      last_id: "claude-haiku-4-5",
    });
  });

  it("rewrites Claude-side model ids before forwarding messages upstream", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "mimo-v2.5",
        content: [],
      });
    }) as typeof fetch;
    const log = vi.fn();
    const server = createTestGateway({ token: "top-secret-token", fetchImpl, log });
    const response = await requestGateway(server, "/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dummy-from-claude",
      },
      body: JSON.stringify({
        model: "anthropic/MiMo-V2.5-Pro",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({
      authorization: "Bearer top-secret-token",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "mimo-v2.5-pro",
      max_tokens: 1,
    });
    await expect(response.json()).resolves.toMatchObject({
      model: "anthropic/MiMo-V2.5-Pro",
    });
    expect(JSON.stringify(log.mock.calls)).toContain("anthropic/MiMo-V2.5-Pro -> mimo-v2.5-pro");
    expect(JSON.stringify(log.mock.calls)).not.toContain("top-secret-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("dummy-from-claude");
  });

  it("maps Claude-safe Desktop route ids to the MiMo upstream model", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "mimo-v2.5",
        content: [],
      });
    }) as typeof fetch;
    const server = createTestGateway({ token: "top-secret-token", fetchImpl });
    const response = await requestGateway(server, "/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer dummy-from-claude",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "mimo-v2.5",
    });
    await expect(response.json()).resolves.toMatchObject({
      model: "claude-haiku-4-5",
    });
  });

  it("strips Claude local 1M markers before resolving route mappings", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: "", init: init ?? {} });
      return Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "mimo-v2.5-pro",
        content: [],
      });
    }) as typeof fetch;
    const server = createTestGateway({ token: "top-secret-token", fetchImpl });
    const response = await requestGateway(server, "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-4-7[1M]",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    });

    expect(response.status).toBe(200);
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      model: "mimo-v2.5-pro",
    });
  });

  it("rejects unknown models before calling upstream", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const server = createTestGateway({ token: "secret", fetchImpl });
    const response = await requestGateway(server, "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mimo-v2.5-pro",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "Unsupported model: mimo-v2.5-pro",
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns a sanitized configuration error when the provider token is missing", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const server = createTestGateway({ token: "", fetchImpl });
    const response = await requestGateway(server, "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/MiMo-V2.5-Pro",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      type: "error",
      error: {
        type: "authentication_error",
        message: "Provider token not configured",
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("adapts Codex Responses requests to Anthropic-compatible messages", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "mimo-v2.5-pro",
        content: [{ type: "text", text: "pong" }],
        usage: { input_tokens: 3, output_tokens: 2 },
      });
    }) as typeof fetch;
    const log = vi.fn();
    const server = createTestGateway({ token: "top-secret-token", fetchImpl, log });
    const response = await requestGateway(server, "/v1/responses", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer local-proxy",
      },
      body: JSON.stringify({
        model: "mimo-v2.5-pro",
        instructions: "Be concise.",
        max_output_tokens: 8,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: "ping" }],
          },
        ],
      }),
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://token-plan-cn.xiaomimimo.com/anthropic/v1/messages");
    expect(calls[0].init.headers).toMatchObject({
      authorization: "Bearer top-secret-token",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      model: "mimo-v2.5-pro",
      max_tokens: 8,
      system: "Be concise.",
      messages: [{ role: "user", content: "ping" }],
    });
    await expect(response.json()).resolves.toMatchObject({
      object: "response",
      status: "completed",
      model: "mimo-v2.5-pro",
      output_text: "pong",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "pong", annotations: [] }],
        },
      ],
      usage: {
        input_tokens: 3,
        output_tokens: 2,
        total_tokens: 5,
      },
    });
    expect(JSON.stringify(log.mock.calls)).toContain("/v1/responses");
    expect(JSON.stringify(log.mock.calls)).not.toContain("top-secret-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("local-proxy");
  });

  it("streams Anthropic SSE as Codex Responses SSE", async () => {
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: message_start\n"));
          controller.enqueue(encoder.encode("data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_1\",\"usage\":{\"input_tokens\":1,\"output_tokens\":0}}}\n\n"));
          controller.enqueue(encoder.encode("event: content_block_delta\n"));
          controller.enqueue(encoder.encode("data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"po\"}}\n\n"));
          controller.enqueue(encoder.encode("event: content_block_delta\n"));
          controller.enqueue(encoder.encode("data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"text_delta\",\"text\":\"ng\"}}\n\n"));
          controller.enqueue(encoder.encode("event: message_stop\n"));
          controller.enqueue(encoder.encode("data: {\"type\":\"message_stop\"}\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;
    const server = createTestGateway({ token: "secret", fetchImpl });
    const response = await requestGateway(server, "/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/MiMo-V2.5",
        max_output_tokens: 4,
        stream: true,
        input: "ping",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: response.created");
    expect(text).toContain("event: response.output_text.delta");
    expect(text).toContain("\"delta\":\"po\"");
    expect(text).toContain("\"delta\":\"ng\"");
    expect(text).toContain("event: response.completed");
  });

  it("returns OpenAI-style errors for unsupported Codex Responses models", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const server = createTestGateway({ token: "secret", fetchImpl });
    const response = await requestGateway(server, "/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mimo-v9",
        input: "ping",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Unsupported model: mimo-v9",
        type: "invalid_request_error",
        param: "model",
        code: "unsupported_model",
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("answers count_tokens locally when the upstream provider does not expose that endpoint", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const server = createTestGateway({ token: "secret", fetchImpl });
    const response = await requestGateway(server, "/v1/messages/count_tokens", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/MiMo-V2.5-Pro",
        system: "Keep replies short.",
        messages: [{ role: "user", content: "Say ok only" }],
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      input_tokens: expect.any(Number),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("streams upstream SSE responses without buffering", async () => {
    const encoder = new TextEncoder();
    const fetchImpl = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("event: message_start\n\n"));
          controller.enqueue(encoder.encode("data: {\"type\":\"content_block_delta\"}\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }) as typeof fetch;
    const server = createTestGateway({ token: "secret", fetchImpl });
    const response = await requestGateway(server, "/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "anthropic/MiMo-V2.5",
        max_tokens: 1,
        stream: true,
        messages: [{ role: "user", content: "." }],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    await expect(response.text()).resolves.toBe(
      "event: message_start\n\ndata: {\"type\":\"content_block_delta\"}\n\n",
    );
  });

  it("health checks every mapped upstream model with a minimal message request", async () => {
    const calls: FetchCall[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return Response.json({ ok: true });
    }) as typeof fetch;
    const settings = normalizeAppSettings({});

    const result = await runProviderHealthCheck({
      settings,
      secrets: { resolveToken: () => "secret" },
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(calls.map((call) => JSON.parse(String(call.init.body)).model)).toEqual([
      "mimo-v2.5-pro",
      "mimo-v2.5",
      "mimo-v2-pro",
      "mimo-v2-omni",
    ]);
  });
});
