import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeAppSettings } from "../../shared/appSettings";
import { createClaudeDesktopGatewayServer, runProviderHealthCheck } from "./claudeDesktopGateway";
import type { GatewaySecretResolver } from "./gatewaySecrets";

type FetchCall = {
  url: string;
  init: RequestInit;
};

const servers: http.Server[] = [];

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

async function listen(server: http.Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  return `http://127.0.0.1:${address.port}`;
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

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
  vi.restoreAllMocks();
});

describe("claude desktop gateway", () => {
  it("returns Anthropic-style model ids from the active provider mapping", async () => {
    const server = createTestGateway({ token: "secret" });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/models`);

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
      ],
      has_more: false,
      first_id: "anthropic/MiMo-V2.5-Pro",
      last_id: "anthropic/MiMo-V2-Omni",
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
        model: "mimo-v2.5-pro",
        content: [],
      });
    }) as typeof fetch;
    const log = vi.fn();
    const server = createTestGateway({ token: "top-secret-token", fetchImpl, log });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/messages`, {
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

  it("rejects unknown models before calling upstream", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const server = createTestGateway({ token: "secret", fetchImpl });
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/messages`, {
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
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/messages`, {
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
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer local-proxy",
      },
      body: JSON.stringify({
        model: "anthropic/MiMo-V2.5-Pro",
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
      model: "anthropic/MiMo-V2.5-Pro",
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
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/responses`, {
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
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/responses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mimo-v2.5-pro",
        input: "ping",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        message: "Unsupported model: mimo-v2.5-pro",
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
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/messages/count_tokens`, {
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
    const baseUrl = await listen(server);

    const response = await fetch(`${baseUrl}/v1/messages`, {
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
