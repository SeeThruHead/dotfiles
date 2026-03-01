// Converts pi session entries into the flat message/tool arrays the UI renders.

import { extractText } from "./helpers.js";

export const buildMessagesFromHistory = (entries) => {
  const messages = [];
  const tools = {};

  for (const entry of entries) {
    const msg = entry.message || entry;
    if (!msg.role) continue;

    if (msg.role === "user") {
      const text = extractText(msg.content);
      if (text) messages.push({ role: "user", text });
    }

    if (msg.role === "assistant") {
      const content = msg.content || [];
      const text = content.filter((c) => c.type === "text").map((c) => c.text).join("");
      const thinking = content.filter((c) => c.type === "thinking").map((c) => c.thinking).join("");
      const toolCalls = content.filter((c) => c.type === "toolCall");

      if (text || thinking) messages.push({ role: "assistant", text, thinking });

      for (const tc of toolCalls) {
        tools[tc.id] = {
          toolName: tc.name,
          args: tc.arguments,
          isRunning: false,
          isError: false,
          result: "",
          partialText: "",
        };
        messages.push({ role: "tool", toolCallId: tc.id });
      }
    }

    if (msg.role === "toolResult") {
      const text = extractText(msg.content);
      if (tools[msg.toolCallId]) {
        tools[msg.toolCallId].result = text;
        tools[msg.toolCallId].isError = msg.isError;
      }
    }
  }

  return { messages, tools };
};
