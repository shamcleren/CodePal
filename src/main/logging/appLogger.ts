import fs from "node:fs";
import path from "node:path";

type ConsoleMethod = (...args: unknown[]) => void;

function formatArg(value: unknown): string {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function installMainProcessFileLogger(logsDir: string): { logFilePath: string } {
  fs.mkdirSync(logsDir, { recursive: true });
  const logFilePath = path.join(logsDir, "app-main.log");

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  } satisfies Record<"log" | "info" | "warn" | "error", ConsoleMethod>;

  function append(level: "INFO" | "WARN" | "ERROR", args: unknown[]) {
    const line = `${new Date().toISOString()} [${level}] ${args.map(formatArg).join(" ")}\n`;
    try {
      fs.appendFileSync(logFilePath, line, "utf8");
    } catch {
      // Logging must never interrupt the main process.
    }
  }

  function writeOriginal(method: ConsoleMethod, args: unknown[]) {
    try {
      method(...args);
    } catch {
      // stdout/stderr may be closed when the app is launched from another process.
      // Logging must never interrupt the main process.
    }
  }

  console.log = (...args: unknown[]) => {
    append("INFO", args);
    writeOriginal(original.log, args);
  };
  console.info = (...args: unknown[]) => {
    append("INFO", args);
    writeOriginal(original.info, args);
  };
  console.warn = (...args: unknown[]) => {
    append("WARN", args);
    writeOriginal(original.warn, args);
  };
  console.error = (...args: unknown[]) => {
    append("ERROR", args);
    writeOriginal(original.error, args);
  };

  console.log("[CodePal Logging] main process file log:", logFilePath);
  return { logFilePath };
}
