import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJetBrainsSessionWatcher } from "./jetbrainsSessionWatcher";

describe("createJetBrainsSessionWatcher", () => {
  let tmpDir: string | null = null;

  function createLogFile(lines: string[]) {
    if (!tmpDir) {
      throw new Error("tmpDir must be initialized before creating a log file");
    }
    const logsDir = path.join(tmpDir, "gongfeng-chat-agent", "log");
    fs.mkdirSync(logsDir, { recursive: true });
    const filePath = path.join(logsDir, "chat-agent.log");
    fs.writeFileSync(filePath, lines.join("\n"));
    return filePath;
  }

  function createIdeaLogFile(ideDirName: string, lines: string[]) {
    if (!tmpDir) {
      throw new Error("tmpDir must be initialized before creating a log file");
    }
    const logsDir = path.join(tmpDir, "Library", "Logs", "JetBrains", ideDirName);
    fs.mkdirSync(logsDir, { recursive: true });
    const filePath = path.join(logsDir, "idea.log");
    fs.writeFileSync(filePath, lines.join("\n"));
    return filePath;
  }

  afterEach(() => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      tmpDir = null;
    }
  });

  it("does not surface empty running workspace lifecycle events as dashboard sessions", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    createLogFile([
      "2025-05-19 15:24:28.938\tDEBUG\tws/wswrap.go:360\treceive msg:Content-Length: 433",
      "Content-Type: application/json-rpc; charset=utf-8",
      "",
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"repo":["git@github.com:shamcleren/bkmonitor-datalink.git"],"workspace":["file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"],"language":"","machine_id":"2da16474866e586e19a637335e77a3140acc9e195298711f170478b676019fcd","session_id":"0196e76d-ff55-7aa3-a7da-78c8960af34c","editor_name":"JetBrainsGoLand","app_version":"v1.45.4"},"id":"1"}',
      "2025-05-19 15:24:28.949\tDEBUG\tws/wswrap.go:485\twrite message:Content-Length: 449",
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"b8712854-0047-e18a-68f1-cf1479345ff0","tools":["list_dir"],"version":"v0.0.24","workspace_uri":"file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"},"jsonrpc":"2.0"}',
      "2025-05-19 15:24:29.116\tINFO\tws/connect.go:96\tuuid from proxy: b8712854-0047-e18a-68f1-cf1479345ff0",
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();
    await watcher.pollOnce();

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("maps lifecycle and connection errors onto the workspace session", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const filePath = createLogFile([]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    fs.appendFileSync(
      filePath,
      [
        '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"repo":[""],"workspace":["file:///Users/renjinming/go/src/git.woa.com/blueking/helm-charts"],"session_id":"0196e76d-ff55-7aa3-a7da-78c8960af34c","editor_name":"JetBrainsGoLand","app_version":"v1.45.4"},"id":"3"}',
        '{"id":"3","result":{"code":0,"msg":"success","uuid":"d3e30a21-11f5-2218-996d-8744f5bf7c7c","workspace_uri":"file:///Users/renjinming/go/src/git.woa.com/blueking/helm-charts"},"jsonrpc":"2.0"}',
        "2025-05-19 15:24:38.263\tINFO\tws/connect.go:96\tuuid from proxy: d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "2025-05-19 15:24:47.241\tDEBUG\tws/wswrap.go:427\tclose connection to proxy:d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "2025-05-19 15:25:43.286\tERROR\tws/connect.go:105\tlisten local failed: read tcp 192.168.255.10:63439->21.34.11.236:80: i/o timeout, d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "2025-05-19 15:25:44.000\tINFO\tws/connect.go:96\tuuid from proxy: d3e30a21-11f5-2218-996d-8744f5bf7c7c",
        "",
      ].join("\n"),
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "0196e76d-ff55-7aa3-a7da-78c8960af34c",
      tool: "goland",
      status: "idle",
      activityItems: [
        expect.objectContaining({
          title: "Request finished",
          tone: "idle",
        }),
      ],
    });
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "0196e76d-ff55-7aa3-a7da-78c8960af34c",
      tool: "goland",
      status: "error",
      activityItems: [
        expect.objectContaining({
          title: "Connection error",
          tone: "error",
          body: "listen local failed: read tcp 192.168.255.10:63439->21.34.11.236:80: i/o timeout",
        }),
      ],
    });
    fs.appendFileSync(
      filePath,
      "2025-05-19 15:25:45.000\tINFO\tws/connect.go:96\tuuid from proxy: d3e30a21-11f5-2218-996d-8744f5bf7c7c\n",
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  it("surfaces ask begin events as running GoLand sessions", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const filePath = createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"],"session_id":"019","editor_name":"JetBrainsGoLand"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb","workspace_uri":"file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"},"jsonrpc":"2.0"}',
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    fs.appendFileSync(
      filePath,
      '2026-04-07 11:39:39.021\tDEBUG\tws/wswrap.go:424\treceive msg:Content-Length: 332\n{"jsonrpc":"2.0","method":"gongfeng/ask/begin","params":{"message_id":"019d66064089715e8eeda9a5a91d1bf1","platform":"jetbrainsgoland","session_id":"019d5274a0c17cfe9085908e5d1de755","uuid":"aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb","workspace":["file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"]},"id":"9"}\n',
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "019",
      tool: "goland",
      status: "running",
      title: "bkmonitor-datalink",
      task: "GoLand · bkmonitor-datalink",
      activityItems: [
        expect.objectContaining({
          title: "Request started",
          body: "CodeBuddy request started",
          tone: "running",
        }),
      ],
    });
  });

  it("reuses the preceding log timestamp for bare chat-agent JSON lines", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const filePath = createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/code/git.woa.com/bkdevtool/bk-aidev"],"session_id":"019d66a26d8872c28d1704b0b1e15370","editor_name":"JetBrainsPyCharm"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"2a113d5c-a014-03bb-c639-bacafaff7d10","workspace_uri":"file:///Users/renjinming/code/git.woa.com/bkdevtool/bk-aidev"},"jsonrpc":"2.0"}',
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    fs.appendFileSync(
      filePath,
      [
        "2026-04-07 15:04:25.700\tINFO\tws/json_rpc_server.go:1122\tAsk event [chat.agent-client.message.start] - uuid: 2a113d5c-a014-03bb-c639-bacafaff7d10, session_id: 019d66a26d8872c28d1704b0b1e15370, request_id: 019d66c1bb637c0eb0e08db5b30a8a35, platform: jetbrainspycharm, workspace: [file:///Users/renjinming/code/git.woa.com/bkdevtool/bk-aidev]",
        '{"jsonrpc":"2.0","method":"gongfeng/ask/begin","params":{"message_id":"019d66c1bb637c0eb0e08db5b30a8a35","platform":"jetbrainspycharm","session_id":"019d66a26d8872c28d1704b0b1e15370","uuid":"2a113d5c-a014-03bb-c639-bacafaff7d10","workspace":["file:///Users/renjinming/code/git.woa.com/bkdevtool/bk-aidev"]},"id":"14"}',
        "",
      ].join("\n"),
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "019d66a26d8872c28d1704b0b1e15370",
      tool: "pycharm",
      status: "running",
      title: "bk-aidev",
    });
    expect(onEvent.mock.calls[0]?.[0].timestamp).toBe(Date.parse("2026-04-07T15:04:25.700"));
  });

  it("maps tool call results into JetBrains session activity", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const filePath = createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"],"session_id":"019","editor_name":"JetBrainsGoLand"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb","workspace_uri":"file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"},"jsonrpc":"2.0"}',
      "2026-04-07 11:12:55.270\tDEBUG\tws/server.go:159\tuuid:aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb, connectionID:3bc819b1-7592-4334-aa17-cf6228a80ce1, remoteAddr:21.34.11.236:443, localAddr:192.168.255.10:65409",
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    fs.appendFileSync(
      filePath,
      '2026-04-07 11:12:55.557\tDEBUG\tws/server_conn.go:64\twrite tool call result, content: {"chat_id":"10004","messages":[{"role":"tool","tool_call_id":"functions.terminal:744","content":"{\\"type\\":\\"result\\",\\"task_id\\":\\"functions.terminal:744\\",\\"status\\":\\"success\\",\\"content\\":\\"go version go1.22.1 darwin/arm64\\\\n\\"}","tool_call_name":"terminal","ConnId":"3bc819b1-7592-4334-aa17-cf6228a80ce1"}]}\n',
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "019",
      tool: "goland",
      status: "completed",
      activityItems: [
        expect.objectContaining({
          kind: "tool",
          title: "terminal",
          toolName: "terminal",
          toolPhase: "result",
        }),
      ],
    });
  });

  it("keeps fetchChatCompletion conversation lifecycle and content on the same conversation session", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const chatAgentFile = createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/demo/codepal"],"session_id":"conv-jetbrains-1","editor_name":"JetBrainsGoLand"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"jb-uuid-1","workspace_uri":"file:///Users/demo/codepal"},"jsonrpc":"2.0"}',
      "",
    ]);
    const ideaLogFile = createIdeaLogFile("GoLand2025.1", []);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: path.join(tmpDir, ".gongfeng-copilot"),
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    fs.mkdirSync(path.join(tmpDir, ".gongfeng-copilot", "gongfeng-chat-agent", "log"), {
      recursive: true,
    });
    fs.copyFileSync(
      chatAgentFile,
      path.join(tmpDir, ".gongfeng-copilot", "gongfeng-chat-agent", "log", "chat-agent.log"),
    );

    await watcher.pollOnce();
    fs.appendFileSync(
      ideaLogFile,
      '2026-04-14 20:00:00.000 INFO fetchChatCompletion-onSuccess: {"type":"RUN_STARTED","threadId":"conv-jetbrains-1","timestamp":1760000000000,"rawEvent":{"conversation_id":"conv-jetbrains-1","uuid":"jb-uuid-1","workspace_uri":"file:///Users/demo/codepal"}}{"type":"TEXT_MESSAGE_CONTENT","threadId":"conv-jetbrains-1","timestamp":1760000001000,"delta":"Hello from JetBrains","rawEvent":{"conversation_id":"conv-jetbrains-1","content":"Hello from JetBrains"}}{"type":"RUN_FINISHED","threadId":"conv-jetbrains-1","timestamp":1760000002000,"rawEvent":{"conversation_id":"conv-jetbrains-1"}}\n',
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(3);
    const emitted = onEvent.mock.calls.map((call) => call[0]);
    expect(
      emitted.some(
        (event) =>
          event.sessionId === "conv-jetbrains-1" &&
          event.tool === "goland" &&
          event.status === "running" &&
          event.activityItems?.[0]?.title === "Request started",
      ),
    ).toBe(true);
    expect(
      emitted.some(
        (event) =>
          event.sessionId === "conv-jetbrains-1" &&
          event.tool === "goland" &&
          event.status === "running" &&
          event.activityItems?.[0]?.kind === "message" &&
          event.activityItems?.[0]?.source === "assistant" &&
          event.activityItems?.[0]?.body === "Hello from JetBrains",
      ),
    ).toBe(true);
    expect(
      emitted.some(
        (event) =>
          event.sessionId === "conv-jetbrains-1" &&
          event.tool === "goland" &&
          event.status === "completed",
      ),
    ).toBe(true);
  });

  it("maps JetBrainsPyCharm to pycharm and keeps unknown JetBrains names generic", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const filePath = createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/shamcleren/pycharm-demo"],"session_id":"019","editor_name":"JetBrainsPyCharm"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"22222222-2222-2222-2222-222222222222","workspace_uri":"file:///Users/renjinming/go/src/github.com/shamcleren/pycharm-demo"},"jsonrpc":"2.0"}',
      "2026-04-07 09:00:00.000\tINFO\tws/connect.go:96\tuuid from proxy: 22222222-2222-2222-2222-222222222222",
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/shamcleren/fleet-demo"],"session_id":"020","editor_name":"JetBrainsFleet"},"id":"2"}',
      '{"id":"2","result":{"code":0,"msg":"success","uuid":"33333333-3333-3333-3333-333333333333","workspace_uri":"file:///Users/renjinming/go/src/github.com/shamcleren/fleet-demo"},"jsonrpc":"2.0"}',
      "2026-04-07 09:01:00.000\tINFO\tws/connect.go:96\tuuid from proxy: 33333333-3333-3333-3333-333333333333",
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    fs.appendFileSync(
      filePath,
      "2026-04-07 09:00:05.000\tERROR\tws/connect.go:105\tlisten local failed: io: read/write on closed pipe, 22222222-2222-2222-2222-222222222222\n",
    );
    fs.appendFileSync(
      filePath,
      "2026-04-07 09:01:05.000\tERROR\tws/connect.go:105\tlisten local failed: io: read/write on closed pipe, 33333333-3333-3333-3333-333333333333\n",
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "019",
      tool: "pycharm",
      title: "pycharm-demo",
      task: "PyCharm · pycharm-demo",
      meta: {
        editorName: "JetBrainsPyCharm",
      },
    });
    expect(onEvent.mock.calls[1]?.[0]).toMatchObject({
      sessionId: "020",
      tool: "jetbrains",
      title: "fleet-demo",
      task: "JetBrains · fleet-demo",
      meta: {
        editorName: "JetBrainsFleet",
      },
    });
  });

  it("does not surface stale bootstrap transport errors without fresh activity", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/shamcleren/demo"],"session_id":"019","editor_name":"jetbrainsgoland"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"11111111-1111-1111-1111-111111111111","workspace_uri":"file:///Users/renjinming/go/src/github.com/shamcleren/demo"},"jsonrpc":"2.0"}',
      "2026-04-03 21:00:00.000\tINFO\tws/connect.go:96\tuuid from proxy: 11111111-1111-1111-1111-111111111111",
      "2026-04-03 21:00:02.000\tERROR\tws/connect.go:105\tlisten local failed: io: read/write on closed pipe, 11111111-1111-1111-1111-111111111111",
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("does not surface websocket abnormal closure noise as a dashboard error", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const filePath = createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"],"session_id":"019","editor_name":"JetBrainsGoLand"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb","workspace_uri":"file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"},"jsonrpc":"2.0"}',
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: tmpDir,
      onEvent,
      initialBootstrapLookbackMs: Number.POSITIVE_INFINITY,
    });

    await watcher.pollOnce();
    fs.appendFileSync(
      filePath,
      "2026-04-07 22:49:00.000\tERROR\tws/connect.go:105\taccept stream failed: websocket: close 1006 (abnormal closure): unexpected EOF, aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb\n",
    );

    await watcher.pollOnce();

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("surfaces assistant message content from JetBrains idea logs", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const chatAgentFile = createLogFile([
      '{"jsonrpc":"2.0","method":"gongfeng/chat-agent-register","params":{"workspace":["file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"],"session_id":"019d5274a0c17cfe9085908e5d1de755","editor_name":"JetBrainsGoLand"},"id":"1"}',
      '{"id":"1","result":{"code":0,"msg":"success","uuid":"aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb","workspace_uri":"file:///Users/renjinming/go/src/github.com/TencentBlueKing/bkmonitor-datalink"},"jsonrpc":"2.0"}',
      "",
    ]);
    const ideaLogFile = createIdeaLogFile("GoLand2025.2", []);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: path.join(tmpDir, ".gongfeng-copilot"),
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    // Prime cursor state for both chat-agent.log and idea.log.
    fs.mkdirSync(path.dirname(chatAgentFile), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".gongfeng-copilot", "gongfeng-chat-agent", "log"), {
      recursive: true,
    });
    fs.copyFileSync(
      chatAgentFile,
      path.join(tmpDir, ".gongfeng-copilot", "gongfeng-chat-agent", "log", "chat-agent.log"),
    );

    await watcher.pollOnce();

    fs.appendFileSync(
      ideaLogFile,
      '2026-04-07 14:30:01,123 [1] INFO - #com.tencent.code.intel.ui.sidebar.conversation.ConversationManager - fetchChatCompletion-onSuccess:{"type":"RUN_STARTED","timestamp":1775543401,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755"},"threadId":"019d5274a0c17cfe9085908e5d1de755"}{"type":"TEXT_MESSAGE_CONTENT","timestamp":1775543402,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755","content":"hello, "},"delta":"hello, "}{"type":"TEXT_MESSAGE_CONTENT","timestamp":1775543402,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755","content":"world"},"delta":"world"}{"type":"RUN_FINISHED","timestamp":1775543403,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755"},"threadId":"019d5274a0c17cfe9085908e5d1de755"}\n',
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(3);
    const emitted = onEvent.mock.calls.map((call) => call[0]);
    expect(
      emitted.some(
        (event) =>
          event.sessionId === "019d5274a0c17cfe9085908e5d1de755" &&
          event.status === "running" &&
          event.activityItems?.[0]?.title === "Request started",
      ),
    ).toBe(true);
    expect(
      emitted.some(
        (event) =>
          event.sessionId === "019d5274a0c17cfe9085908e5d1de755" &&
          event.activityItems?.[0]?.kind === "message" &&
          event.activityItems?.[0]?.source === "assistant" &&
          event.activityItems?.[0]?.body === "hello, world",
      ),
    ).toBe(true);
    expect(
      emitted.some(
        (event) =>
          event.sessionId === "019d5274a0c17cfe9085908e5d1de755" &&
          event.status === "completed" &&
          event.activityItems?.[0]?.title === "Request finished",
      ),
    ).toBe(true);
  });

  it("captures JetBrains user prompts from gongfeng chat requests so sessions sort by new input", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const ideaLogFile = createIdeaLogFile("PyCharm2024.3", []);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: path.join(tmpDir, ".gongfeng-copilot"),
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();

    fs.appendFileSync(
      ideaLogFile,
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "gongfeng/chat",
        params: {
          conversationId: "jb-conv-1",
          uuid: "jb-uuid-1",
          user_input: "hello from pycharm",
          workspace_uris: ["file:///Users/renjinming/code/demo-pycharm"],
        },
        id: 1,
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "jb-conv-1",
      tool: "pycharm",
      status: "running",
      title: "demo-pycharm",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          title: "User",
          body: "hello from pycharm",
        }),
      ],
    });
  });

  it("captures JetBrains user prompts from get-question-summarize requests", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const ideaLogFile = createIdeaLogFile("PyCharm2024.3", []);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: path.join(tmpDir, ".gongfeng-copilot"),
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();

    fs.appendFileSync(
      ideaLogFile,
      `${JSON.stringify({
        jsonrpc: "2.0",
        method: "gongfeng/get-question-summarize",
        params: {
          conversation_Id: "jb-conv-2",
          message_Id: "jb-msg-2",
          chat_extra: {
            ide_version: "JetBrainsPyCharm/PY-243.23654.177",
            main_workspace_url: "file:///Users/renjinming/code/demo-pycharm",
            user_input: "direct reply please",
          },
        },
        id: 2,
      })}\n`,
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "jb-conv-2",
      tool: "pycharm",
      status: "running",
      title: "demo-pycharm",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          title: "User",
          body: "direct reply please",
        }),
      ],
      meta: expect.objectContaining({
        workspacePath: "/Users/renjinming/code/demo-pycharm",
      }),
    });
  });

  it("parses JetBrains JSON log lines with trailing thread suffixes", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    const ideaLogFile = createIdeaLogFile("PyCharm2024.3", []);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: path.join(tmpDir, ".gongfeng-copilot"),
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();

    fs.appendFileSync(
      ideaLogFile,
      '2026-04-07 14:30:25,882 [448850322]   INFO - #com.tencent.code.intel.impl.LspService - Content-Length: 539\n\n' +
        '{"id":6945,"jsonrpc":"2.0","method":"gongfeng/get-question-summarize","params":{"chat_extra":{"ide_version":"JetBrainsPyCharm/PY-243.23654.177","main_workspace_url":"file:///Users/renjinming/code/demo-pycharm","user_input":"direct reply please"},"conversation_Id":"jb-conv-3","message_Id":"jb-msg-3"}}[ThreadManager-LogPrintExecutor]\n',
    );

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "jb-conv-3",
      tool: "pycharm",
      activityItems: [
        expect.objectContaining({
          kind: "message",
          source: "user",
          body: "direct reply please",
        }),
      ],
    });
  });

  it("keeps bootstrap JetBrains sessions on the newest meaningful terminal event instead of stale running", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codepal-jetbrains-"));
    createIdeaLogFile("GoLand2025.2", [
      '2026-04-07 14:30:01,123 [1] INFO - #com.tencent.code.intel.ui.sidebar.conversation.ConversationManager - fetchChatCompletion-onSuccess:{"type":"RUN_STARTED","timestamp":1775543401,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755"},"threadId":"019d5274a0c17cfe9085908e5d1de755"}{"type":"TEXT_MESSAGE_CONTENT","timestamp":1775543402,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755","content":"hello, "},"delta":"hello, "}{"type":"TEXT_MESSAGE_CONTENT","timestamp":1775543402,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755","content":"world"},"delta":"world"}{"type":"RUN_FINISHED","timestamp":1775543403,"rawEvent":{"message_id":"m1","conversation_id":"019d5274a0c17cfe9085908e5d1de755"},"threadId":"019d5274a0c17cfe9085908e5d1de755"}',
      "",
    ]);

    const onEvent = vi.fn();
    const watcher = createJetBrainsSessionWatcher({
      logRoot: path.join(tmpDir, ".gongfeng-copilot"),
      onEvent,
      initialBootstrapLookbackMs: 10_000_000_000_000,
    });

    await watcher.pollOnce();

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]?.[0]).toMatchObject({
      sessionId: "019d5274a0c17cfe9085908e5d1de755",
      status: "completed",
      activityItems: [
        expect.objectContaining({
          title: "Request finished",
        }),
      ],
    });
  });
});
