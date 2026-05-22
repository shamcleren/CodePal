import type { SessionActionType } from "./capabilityTypes";

/** The operation lifecycle phase */
export type OperationPhase = "preflight" | "dry_run" | "execute" | "result";

/** Whether an operation is safe to run without confirmation */
export type OperationRiskLevel = "safe" | "low" | "medium" | "high";

/** Pre-execution check result */
export interface OperationPreflightResult {
  /** Whether the operation can proceed */
  proceed: boolean;
  /** Risk assessment */
  risk: OperationRiskLevel;
  /** Human-readable description of what will happen */
  description: string;
  /** Warnings the user should acknowledge */
  warnings: string[];
  /** Whether dry-run is available for this operation */
  dryRunAvailable: boolean;
  /** Target information for user confirmation */
  target: {
    sessionId: string;
    agent: string;
    action: SessionActionType;
    /** Specific target within the session (pane, terminal, etc.) */
    detail?: string;
  };
}

/** Result of a dry-run execution */
export interface OperationDryRunResult {
  /** What would happen */
  preview: string;
  /** Any caveats or limitations of the preview */
  caveats: string[];
}

/** Final execution result */
export interface OperationExecuteResult {
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error message if it failed */
  error?: string;
  /** Human-readable result description */
  summary: string;
  /** Timestamp of execution */
  timestamp: number;
  /** Duration in milliseconds */
  durationMs: number;
}

/** A complete operation log entry for the local operation log */
export interface OperationLogEntry {
  /** Unique operation id */
  id: string;
  /** The action that was performed */
  action: SessionActionType;
  /** Target session */
  sessionId: string;
  /** Agent that owns the session */
  agent: string;
  /** Whether the operation succeeded */
  ok: boolean;
  /** Error message if failed */
  error?: string;
  /** Human-readable summary */
  summary: string;
  /** When the operation started */
  startedAt: number;
  /** When the operation completed */
  completedAt: number;
  /** Duration in ms */
  durationMs: number;
  /** Additional context (message text, target path, etc.) */
  detail?: string;
}

/** Full operation flow result combining all phases */
export interface OperationFlowResult {
  /** The preflight check */
  preflight: OperationPreflightResult;
  /** Dry-run result if requested and available */
  dryRun?: OperationDryRunResult;
  /** Execution result (only if preflight proceeded) */
  execution?: OperationExecuteResult;
  /** The final log entry */
  logEntry: OperationLogEntry;
}

/** Risk level per action type */
const ACTION_RISK: Record<SessionActionType, OperationRiskLevel> = {
  jump: "safe",
  sendMessage: "low",
  openRepo: "safe",
};

/** Whether an action supports dry-run */
const DRY_RUN_ACTIONS: Set<SessionActionType> = new Set();

/**
 * Build a preflight result for a given action and session.
 * This is purely deterministic — no side effects.
 */
export function buildPreflight(
  sessionId: string,
  agent: string,
  action: SessionActionType,
  detail?: string,
): OperationPreflightResult {
  const risk = ACTION_RISK[action] ?? "medium";

  let description: string;
  const warnings: string[] = [];

  switch (action) {
    case "jump":
      description = detail
        ? `Switch to the terminal running this session (${detail})`
        : "Switch to the terminal running this session";
      break;
    case "sendMessage":
      description = "Send a text message to the agent in this session";
      if (risk !== "safe") {
        warnings.push("The message will be sent directly to the agent's terminal");
      }
      break;
    case "openRepo":
      description = detail
        ? `Open repository at ${detail}`
        : "Open the repository folder for this session";
      break;
    default:
      description = `Execute ${action} on session`;
      warnings.push("Unknown action — proceed with caution");
  }

  return {
    proceed: true,
    risk,
    description,
    warnings,
    dryRunAvailable: DRY_RUN_ACTIONS.has(action),
    target: {
      sessionId,
      agent,
      action,
      detail,
    },
  };
}

/** Generate a unique operation id */
export function generateOperationId(): string {
  return `op-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
