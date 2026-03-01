import { useState, useRef, useCallback } from "../vendor.js";
import { html } from "../html.js";

export const ChatInput = ({ isStreaming, onSend, onAbort }) => {
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed, isStreaming ? "steer" : null);
    setText("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }, [text, isStreaming, onSend]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleInput = useCallback((e) => {
    setText(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  }, []);

  return html`
    <div class="fixed bottom-0 left-0 right-0 flex items-end px-3.5 py-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] bg-surface border-t border-border gap-2 z-10">
      <span class="text-violet-500 text-base font-bold leading-9 shrink-0">❯</span>
      <textarea
        ref=${inputRef}
        rows="1"
        class="flex-1 bg-deep border border-border rounded-md text-gray-200 font-mono text-sm px-3 py-2 resize-none min-h-[36px] max-h-[120px] outline-none focus:border-violet-600 leading-snug"
        placeholder="Type a message…"
        value=${text}
        onInput=${handleInput}
        onKeyDown=${handleKeyDown}
      ></textarea>
      <button
        class="rounded-md font-mono text-xs font-semibold px-3.5 py-2 min-h-[36px] whitespace-nowrap bg-violet-600 text-white hover:bg-violet-700"
        onClick=${handleSend}
      >
        ${isStreaming ? "Steer" : "Send"}
      </button>
      ${isStreaming && html`
        <button
          class="rounded-md font-mono text-xs font-semibold px-3.5 py-2 min-h-[36px] whitespace-nowrap bg-red-400 text-white hover:opacity-80"
          onClick=${onAbort}
        >
          Stop
        </button>
      `}
    </div>
  `;
};
