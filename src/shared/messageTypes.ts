// src/shared/messageTypes.ts

export type SendMessagePayload = {
  sessionId: string;
  text: string;
};

export type SendMessageResult = {
  sessionId: string;
  result: "success" | "error";
  error?: string;
};

/**
 * JSON line format used on the internal IPC channel when CodePal forwards a
 * user message to an agent over `sendMessageToSession` (future fallback path).
 * Terminal-based delivery (tmux / Ghostty) does not use this shape.
 */
export type UserMessageLine = {
  type: "user_message";
  sessionId: string;
  text: string;
  timestamp: number;
};
