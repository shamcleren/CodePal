import type { PendingActionType } from "./sessionTypes";

export type ActionResponse =
  | { kind: "option"; value: string }
  | { kind: "approval"; decision: "allow" | "deny" };

export type ActionResponsePayload = {
  type: "action_response";
  sessionId: string;
  actionId: string;
  response: ActionResponse;
};

function approvalDecisionFromOption(option: string): "allow" | "deny" {
  if (option === "Allow") return "allow";
  if (option === "Deny") return "deny";
  throw new Error(`invalid approval option: ${option}`);
}

export function buildActionResponsePayload(
  sessionId: string,
  actionId: string,
  option: string,
  actionType: PendingActionType = "single_choice",
): ActionResponsePayload {
  return {
    type: "action_response",
    sessionId,
    actionId,
    response:
      actionType === "approval"
        ? { kind: "approval", decision: approvalDecisionFromOption(option) }
        : { kind: "option", value: option },
  };
}

export function stringifyActionResponsePayload(
  sessionId: string,
  actionId: string,
  option: string,
  actionType: PendingActionType = "single_choice",
): string {
  return JSON.stringify(buildActionResponsePayload(sessionId, actionId, option, actionType));
}
