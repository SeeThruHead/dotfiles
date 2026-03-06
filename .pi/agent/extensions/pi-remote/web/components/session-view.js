import { useState, useEffect, useRef, useCallback } from "../vendor.js";
import { html } from "../html.js";
import { buildMessagesFromHistory } from "../history.js";
import { UserMessage } from "./user-message.js";
import { AssistantMessage } from "./assistant-message.js";
import { ToolBlock } from "./tool-block.js";
import { ChatInput } from "./chat-input.js";

const _log = (text) => {
  if (typeof window !== "undefined" && window.__dbg) window.__dbg(text);
};

_log("session-view.js module loaded");

const sendToSession = (sessionId, payload) => {
  fetch(location.origin + "/api/send/" + sessionId, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((err) => _log("‼️ POST error: " + err.message));
};

export const SessionView = ({ host, port: sessionId }) => {
  const [status, setStatus] = useState("connecting…");
  const [cwd, setCwd] = useState("");
  const [messages, setMessages] = useState([]);
  const [tools, setTools] = useState({});
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamThinking, setStreamThinking] = useState("");
  const [streamingTools, setStreamingTools] = useState([]);

  const chatRef = useRef(null);
  const autoScrollRef = useRef(true);
  const streamTextRef = useRef("");
  const streamThinkingRef = useRef("");
  const streamingToolsRef = useRef([]);
  // Track IDs already flushed from streaming into messages to avoid duplicates
  const flushedToolIdsRef = useRef(new Set());

  // ── Scroll management ──
  // Polling-based: a 250ms timer scrolls to bottom when enabled.
  // Only USER scrolls (wheel/touch/keyboard) can disable auto-scroll.
  // Programmatic scrolls from the timer are flagged and ignored.

  const isProgrammaticScrollRef = useRef(false);

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;

    // Only react to user-initiated scrolls, not our own programmatic ones.
    const onScroll = () => {
      if (isProgrammaticScrollRef.current) {
        isProgrammaticScrollRef.current = false;
        return;
      }
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distFromBottom < 30) {
        autoScrollRef.current = true;
      } else {
        autoScrollRef.current = false;
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });

    const timer = setInterval(() => {
      if (autoScrollRef.current && el) {
        isProgrammaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
      }
    }, 250);

    return () => {
      el.removeEventListener("scroll", onScroll);
      clearInterval(timer);
    };
  }, []);

  // ── SSE + POST transport (works on Safari, no WebSocket proxy needed) ──

  const sseRef = useRef(null);

  useEffect(() => {
    const sseUrl = location.origin + "/sse/" + sessionId;
    _log("SSE connecting to " + sseUrl);
    const es = new EventSource(sseUrl);
    sseRef.current = es;

    es.onopen = () => {
      _log("SSE open");
    };

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "_sse_connected") {
          _log("SSE upstream connected");
          setStatus("connected");
          // Request history via POST
          sendToSession(sessionId, { type: "get_history" });
          return;
        }
        if (msg.type === "_sse_disconnected") {
          _log("SSE upstream disconnected");
          setStatus("disconnected");
          setStreaming(false);
          return;
        }
        _log("SSE msg: " + msg.type);
        try {
          handleEvent(msg);
        } catch (err) {
          _log("‼️ handleEvent ERROR: " + err.message);
        }
      } catch (err) {
        _log("‼️ SSE parse error: " + err.message);
      }
    };

    es.onerror = (e) => {
      _log("SSE error (readyState=" + es.readyState + ")");
      if (es.readyState === EventSource.CLOSED) {
        setStatus("disconnected");
        setStreaming(false);
      }
    };

    return () => {
      _log("SSE closing");
      es.close();
    };
  }, [host, sessionId]);

  // ── Event handler ──

  const flushStream = () => {
    if (streamTextRef.current || streamThinkingRef.current) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: streamTextRef.current, thinking: streamThinkingRef.current },
      ]);
      streamTextRef.current = "";
      streamThinkingRef.current = "";
      setStreamText("");
      setStreamThinking("");
    }

    // Flush streaming tool calls into messages/tools state
    const currentStreamTools = streamingToolsRef.current;
    if (currentStreamTools.length > 0) {
      setTools((prev) => {
        const next = { ...prev };
        for (const tc of currentStreamTools) {
          if (!next[tc.id]) {
            next[tc.id] = {
              toolName: tc.name,
              args: typeof tc.arguments === "object" ? tc.arguments : {},
              isRunning: true,
              isError: false,
              result: "",
              partialText: "",
            };
          }
        }
        return next;
      });
      setMessages((prev) => {
        const existingToolIds = new Set(prev.filter((m) => m.role === "tool").map((m) => m.toolCallId));
        const newEntries = currentStreamTools
          .filter((tc) => !existingToolIds.has(tc.id))
          .map((tc) => ({ role: "tool", toolCallId: tc.id }));
        flushedToolIdsRef.current = new Set([
          ...flushedToolIdsRef.current,
          ...currentStreamTools.map((tc) => tc.id),
        ]);
        return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
      });
    }

    streamingToolsRef.current = [];
    setStreamingTools([]);
  };

  const handleEvent = (msg) => {
    if (msg.type === "metadata") {
      _log("metadata: cwd=" + (msg.cwd || "?") + " streaming=" + msg.isStreaming);
      setCwd(msg.cwd || "");
      setStatus(msg.isStreaming ? "streaming…" : "idle");
      setStreaming(msg.isStreaming);
    }

    if (msg.type === "history") {
      try {
        const rendered = buildMessagesFromHistory(msg.entries || []);
        _log("history: " + rendered.messages.length + " msgs, " + Object.keys(rendered.tools).length + " tools");
        setMessages(rendered.messages);
        setTools(rendered.tools);
      } catch (err) {
        _log("‼️ buildMessagesFromHistory ERROR: " + err.message + "\n" + (err.stack || ""));
      }
    }

    if (msg.type === "agent_start") {
      setStreaming(true);
      setStatus("streaming…");
      flushedToolIdsRef.current = new Set();
    }

    if (msg.type === "agent_end") {
      flushStream();
      setStreaming(false);
      setStatus("idle");
    }

    if (msg.type === "user_input" && msg.source !== "extension") {
      setMessages((prev) => [...prev, { role: "user", text: msg.text }]);
    }

    if (msg.type === "message_start" && msg.message?.role === "assistant") {
      streamTextRef.current = "";
      streamThinkingRef.current = "";
      streamingToolsRef.current = [];
      setStreamText("");
      setStreamThinking("");
      setStreamingTools([]);
    }

    if (msg.type === "message_update") {
      // Read the full accumulated message content — this is the source of truth.
      // Covers text, thinking, tool calls, and any other content types pi adds.
      if (msg.message?.content) {
        const content = msg.message.content;

        const text = content
          .filter((c) => c.type === "text")
          .map((c) => c.text || "")
          .join("");

        const thinking = content
          .filter((c) => c.type === "thinking")
          .map((c) => c.thinking || "")
          .join("");

        streamTextRef.current = text;
        streamThinkingRef.current = thinking;
        setStreamText(text);
        setStreamThinking(thinking);

        const toolCalls = content.filter(
          (c) => c.type === "toolCall" || c.type === "tool_use"
        );
        if (toolCalls.length > 0) {
          streamingToolsRef.current = toolCalls;
          setStreamingTools([...toolCalls]);
        }
      } else {
        // Fallback: use delta events if message content not available
        const evt = msg.assistantMessageEvent;
        if (evt?.type === "text_delta" && evt.delta) {
          streamTextRef.current += evt.delta;
          setStreamText(streamTextRef.current);
        }
        if (evt?.type === "thinking_delta" && evt.delta) {
          streamThinkingRef.current += evt.delta;
          setStreamThinking(streamThinkingRef.current);
        }
      }
    }

    if (msg.type === "message_end") {
      flushStream();
    }

    if (msg.type === "tool_execution_start") {
      setTools((prev) => ({
        ...prev,
        [msg.toolCallId]: {
          ...(prev[msg.toolCallId] || {}),
          toolName: msg.toolName,
          args: msg.args,
          isRunning: true,
          isError: false,
          result: "",
          partialText: "",
        },
      }));
      // Only add message entry if not already present (from streaming phase)
      setMessages((prev) => {
        if (prev.some((m) => m.role === "tool" && m.toolCallId === msg.toolCallId)) {
          return prev;
        }
        return [...prev, { role: "tool", toolCallId: msg.toolCallId }];
      });
    }

    if (msg.type === "tool_execution_update") {
      const text =
        msg.partialResult?.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("") || "";
      setTools((prev) => ({
        ...prev,
        [msg.toolCallId]: { ...prev[msg.toolCallId], partialText: text },
      }));
    }

    if (msg.type === "tool_execution_end") {
      const text =
        msg.result?.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("") || "";
      setTools((prev) => ({
        ...prev,
        [msg.toolCallId]: {
          ...prev[msg.toolCallId],
          isRunning: false,
          isError: msg.isError,
          result: text,
          partialText: "",
        },
      }));
    }

    if (msg.type === "model_change") {
      setStatus(msg.model);
    }
  };

  // ── Actions ──

  const handleSend = useCallback(
    (text, deliverAs) => {
      const payload = { type: "prompt", text };
      if (deliverAs) payload.deliverAs = deliverAs;
      sendToSession(sessionId, payload);
    },
    [sessionId]
  );

  const handleScrollToBottom = useCallback(() => {
    if (chatRef.current) {
      autoScrollRef.current = true;
      isProgrammaticScrollRef.current = true;
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, []);

  const handleAbort = useCallback(() => {
    sendToSession(sessionId, { type: "abort" });
  }, [sessionId]);

  // Clean up SSE when navigating away
  useEffect(() => {
    return () => sseRef.current?.close();
  }, [host, sessionId]);

  // ── Render ──

  // Log render state on every render so we can see what's happening
  _log("RENDER: msgs=" + messages.length + " tools=" + Object.keys(tools).length + " status=" + status + " streaming=" + streaming + " streamText=" + (streamText ? streamText.length + "chars" : "empty"));

  const renderedMessages = messages.map((m, i) => {
    if (m.role === "user") {
      return html`<${UserMessage} key=${"u" + i} text=${m.text} />`;
    }
    if (m.role === "assistant") {
      return html`<${AssistantMessage} key=${"a" + i} text=${m.text} thinking=${m.thinking} isStreaming=${false} />`;
    }
    if (m.role === "tool") {
      const t = tools[m.toolCallId];
      if (!t) return null;
      return html`<${ToolBlock} key=${m.toolCallId} ...${t} toolCallId=${m.toolCallId} />`;
    }
    return null;
  });

  // Render streaming tool calls that haven't been flushed into messages yet
  const streamingToolBlocks = streamingTools
    .filter((tc) => !flushedToolIdsRef.current.has(tc.id))
    .map((tc) => {
      const args = typeof tc.arguments === "object" ? tc.arguments : {};
      return html`<${ToolBlock}
        key=${"stream-" + tc.id}
        toolCallId=${tc.id}
        toolName=${tc.name}
        args=${args}
        isRunning=${false}
        isError=${false}
        result=""
        partialText=""
        isStreamingArgs=${true}
      />`;
    });

  const hasStreamContent = streamText || streamThinking;

  return html`
    <div class="h-screen flex flex-col overflow-hidden">
      <div class="shrink-0 flex items-center px-3.5 py-2.5 bg-surface border-b border-border min-h-[44px] gap-2.5">
        <a
          href="#/"
          class="text-violet-500 font-mono text-sm px-2 py-1 rounded hover:bg-violet-800 hover:text-white no-underline"
        >
          ← back
        </a>
        <div class="flex-1 overflow-hidden">
          <div class="text-blue-400 text-xs truncate">${cwd}</div>
          <div class="text-[11px] text-gray-500">${status}</div>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-3.5 pt-3 pb-[calc(150px+env(safe-area-inset-bottom))]" ref=${chatRef}>
        ${renderedMessages}
        ${hasStreamContent && html`
          <${AssistantMessage} text=${streamText} thinking=${streamThinking} isStreaming=${true} />
        `}
        ${streamingToolBlocks}
      </div>
      <button
        class="fixed bottom-[calc(75px+env(safe-area-inset-bottom))] right-3.5 z-20 w-9 h-9 rounded-md bg-violet-600/70 hover:bg-violet-600 text-white flex items-center justify-center shadow-lg backdrop-blur-sm"
        onClick=${handleScrollToBottom}
        aria-label="Scroll to bottom"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3,3 8,8 13,3" />
          <polyline points="3,8 8,13 13,8" />
        </svg>
      </button>
      <${ChatInput} isStreaming=${streaming} onSend=${handleSend} onAbort=${handleAbort} />
    </div>
  `;
};
