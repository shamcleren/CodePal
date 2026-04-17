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
 * JSON line format sent from CodePal to agent via keep-alive connection.
 */
export type UserMessageLine = {
  type: "user_message";
  sessionId: string;
  text: string;
  timestamp: number;
};
