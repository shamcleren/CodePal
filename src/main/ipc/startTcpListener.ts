import type net from "node:net";
import type { IntegrationListenerDiagnostics } from "../../shared/integrationTypes";

export type TcpListenerStartResult =
  | { status: "listening"; diagnostics: IntegrationListenerDiagnostics }
  | { status: "already_running"; diagnostics: IntegrationListenerDiagnostics }
  | { status: "error"; diagnostics: IntegrationListenerDiagnostics; error: Error };

function alreadyRunningMessage(host: string, port: number): string {
  return `已有 CodePal 在运行（${host}:${port}）`;
}

function startupFailureMessage(error: Error): string {
  return `CodePal 接收入口启动失败：${error.message}`;
}

export async function startTcpListener(
  server: Pick<net.Server, "listen" | "once" | "off" | "address">,
  host: string,
  port: number,
): Promise<TcpListenerStartResult> {
  return await new Promise<TcpListenerStartResult>((resolve) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off("error", onError);
      if (err.code === "EADDRINUSE") {
        resolve({
          status: "already_running",
          diagnostics: {
            mode: "unavailable",
            message: alreadyRunningMessage(host, port),
          },
        });
        return;
      }
      resolve({
        status: "error",
        diagnostics: {
          mode: "unavailable",
          message: startupFailureMessage(err),
        },
        error: err,
      });
    };

    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve({
        status: "listening",
        diagnostics: {
          mode: "tcp",
          host,
          port,
        },
      });
    });
  });
}
