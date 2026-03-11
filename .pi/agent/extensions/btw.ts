/**
 * /btw — Ask a quick side question without interrupting current work.
 *
 * Shows a non-capturing overlay anchored above the editor.
 * Grows upward into the conversation area without moving the prompt.
 *
 * Trigger: Ctrl+Shift+B or /btw
 */

import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, wrapTextWithAnsi, visibleWidth, type OverlayHandle, type TUI, type Component } from "@mariozechner/pi-tui";

const BTW_MODEL_ID = "claude-haiku-4-5";

const SYSTEM_PROMPT = `You answer quick side questions in 1-2 sentences max. Be extremely brief and direct. No markdown, no bullet points, no headers. Just a plain short answer.`;

function getConversationContext(ctx: any): string {
  const branch = ctx.sessionManager.getBranch();
  const parts: string[] = [];

  for (const entry of branch) {
    if (entry.type === "message") {
      const msg = entry.message;
      if (!msg) continue;
      const role = msg.role;

      if (role === "user" || role === "assistant") {
        const texts: string[] = [];
        for (const part of msg.content || []) {
          if (part.type === "text") texts.push(part.text);
        }
        if (texts.length) parts.push(`[${role}]: ${texts.join("\n")}`);
      } else if (role === "toolResult") {
        const texts: string[] = [];
        for (const part of msg.content || []) {
          if (part.type === "text") texts.push(part.text);
        }
        if (texts.length) parts.push(`[tool:${msg.toolName}]: ${texts.join("\n")}`);
      } else if (role === "bashExecution") {
        parts.push(`[bash$ ${msg.command}]:\n${msg.output}`);
      }
    } else if (entry.type === "compaction") {
      parts.push(`[summary]: ${entry.summary}`);
    }
  }

  return parts.join("\n\n");
}

async function doAsk(
  question: string,
  conversationContext: string,
  signal: AbortSignal,
  ctx: any,
): Promise<string> {
  const model = ctx.modelRegistry.find("anthropic", BTW_MODEL_ID);
  if (!model) return "(model not found — is claude-haiku-4-5 configured?)";

  const apiKey = await ctx.modelRegistry.getApiKey(model);

  const userMessage: UserMessage = {
    role: "user",
    content: [{ type: "text", text: `ANSWER THIS QUESTION: ${question}\n\nConversation context for reference:\n---\n${conversationContext}\n---\n\nREMINDER — ANSWER THIS QUESTION: ${question}` }],
    timestamp: Date.now(),
  };

  const response = await complete(
    model,
    { systemPrompt: SYSTEM_PROMPT, messages: [userMessage] },
    { apiKey, signal, maxTokens: 150 },
  );

  if (response.stopReason === "aborted") {
    return "(cancelled)";
  }

  return response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n") || "(no response)";
}

class BtwPanel implements Component {
  private lines: string[] = [];
  private theme: any;

  constructor(theme: any) {
    this.theme = theme;
  }

  setLines(lines: string[]) {
    this.lines = lines;
  }

  handleInput(data: string): void {
    // Non-capturing — input goes to the main editor, not here
  }

  render(width: number): string[] {
    const th = this.theme;
    const innerW = width - 2;
    const bar = (c: string) => th.fg("warning", c);
    const pad = (s: string) => truncateToWidth(s, innerW, "...", true);

    const out: string[] = [];

    // Top border
    out.push(bar("╭" + "─".repeat(innerW) + "╮"));

    for (const line of this.lines) {
      if (line === "") {
        out.push(bar("│") + pad("") + bar("│"));
      } else {
        // Wrap long lines to fit, then pad each
        const wrapped = wrapTextWithAnsi(line, innerW - 2);
        for (const wl of wrapped) {
          out.push(bar("│") + pad(" " + wl) + bar("│"));
        }
      }
    }

    // Bottom border
    out.push(bar("╰" + "─".repeat(innerW) + "╯"));

    return out;
  }

  invalidate(): void {}
}

export default function (pi: ExtensionAPI) {
  let overlayHandle: OverlayHandle | null = null;
  let panel: BtwPanel | null = null;
  let isOpen = false;

  function showOverlay(tui: TUI, theme: any, lines: string[]) {
    if (!panel) {
      panel = new BtwPanel(theme);
    }
    panel.setLines(lines);

    if (!overlayHandle) {
      overlayHandle = tui.showOverlay(panel, {
        nonCapturing: true,
        anchor: "bottom-center",
        width: "60%",
        minWidth: 50,
        margin: { bottom: 3 },
      });
    }

    tui.requestRender();
  }

  function hideOverlay() {
    if (overlayHandle) {
      overlayHandle.hide();
      overlayHandle = null;
      panel = null;
    }
    isOpen = false;
  }

  async function openBtw(ctx: any) {
    if (isOpen) return;
    isOpen = true;

    // Use built-in input for question
    const question = await ctx.ui.input("/btw", "Ask a quick question...");

    if (!question?.trim()) {
      isOpen = false;
      return;
    }

    // Show "Thinking..." overlay
    await ctx.ui.custom<void>(
      (tui: any, theme: any, _kb: any, done: () => void) => {
        showOverlay(tui, theme, [
          theme.fg("warning", "/btw ") + question,
          "",
          theme.fg("muted", "Thinking..."),
        ]);

        // Fetch answer
        const abortController = new AbortController();
        const context = getConversationContext(ctx);

        doAsk(question.trim(), context, abortController.signal, ctx)
          .then((answer) => {
            showOverlay(tui, theme, [
              theme.fg("warning", "/btw ") + question,
              "",
              answer,
              "",
              theme.fg("muted", "Press Space, Enter, or Escape to dismiss"),
            ]);
          })
          .catch(() => {
            showOverlay(tui, theme, [
              theme.fg("warning", "/btw ") + question,
              "",
              theme.fg("error", "(request failed or cancelled)"),
              "",
              theme.fg("muted", "Press Escape to dismiss"),
            ]);
          });

        // Invisible component that just listens for dismiss keys
        return {
          handleInput(data: string) {
            if (matchesKey(data, Key.escape) || matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
              hideOverlay();
              done();
            }
          },
          render(): string[] { return []; },
          invalidate() {},
        };
      },
    );

    hideOverlay();
  }

  pi.registerShortcut("ctrl+shift+b", {
    description: "Ask a quick side question (btw)",
    handler: async (ctx) => {
      await openBtw(ctx);
    },
  });

  pi.registerCommand("btw", {
    description: "Ask a quick side question without interrupting current work",
    handler: async (args, ctx) => {
      if (args?.trim()) {
        // Inline question — show overlay directly
        await ctx.ui.custom<void>(
          (tui: any, theme: any, _kb: any, done: () => void) => {
            showOverlay(tui, theme, [
              theme.fg("warning", "/btw ") + args.trim(),
              "",
              theme.fg("muted", "Thinking..."),
            ]);

            const context = getConversationContext(ctx);
            doAsk(args.trim(), context, new AbortController().signal, ctx)
              .then((answer) => {
                showOverlay(tui, theme, [
                  theme.fg("warning", "/btw ") + args.trim(),
                  "",
                  answer,
                  "",
                  theme.fg("muted", "Press Space, Enter, or Escape to dismiss"),
                ]);
              })
              .catch(() => {
                showOverlay(tui, theme, [
                  theme.fg("warning", "/btw ") + args.trim(),
                  "",
                  theme.fg("error", "(request failed)"),
                ]);
              });

            return {
              handleInput(data: string) {
                if (matchesKey(data, Key.escape) || matchesKey(data, Key.space) || matchesKey(data, Key.enter)) {
                  hideOverlay();
                  done();
                }
              },
              render(): string[] { return []; },
              invalidate() {},
            };
          },
        );
        hideOverlay();
      } else {
        await openBtw(ctx);
      }
    },
  });
}
