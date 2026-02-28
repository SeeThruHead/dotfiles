/**
 * Effect LSP Extension for pi
 *
 * Integrates with TypeScript's language server (with @effect/language-service plugin)
 * to provide diagnostics, hover info, and completions for Effect codebases.
 *
 * The extension auto-detects Effect projects (checks for @effect/language-service
 * in tsconfig plugins) and lazily starts a tsserver process.
 *
 * Tools:
 *   - effect_diagnostics: Get diagnostics for a file (or all open files)
 *   - effect_quickinfo:   Get hover/type info at a file position
 *   - effect_completions: Get completions at a file position
 *
 * Commands:
 *   - /effect-lsp: Show LSP status and toggle
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { TsServer } from "./tsserver";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export default function effectLspExtension(pi: ExtensionAPI) {
  let server: TsServer | null = null;
  let enabled = true;
  let projectRoot = "";

  // ── Helpers ─────────────────────────────────────────────

  const detectEffectProject = (cwd: string): boolean => {
    const tsconfigPath = join(cwd, "tsconfig.json");
    if (!existsSync(tsconfigPath)) return false;
    try {
      // Strip comments from tsconfig (very basic)
      const raw = readFileSync(tsconfigPath, "utf-8")
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      const tsconfig = JSON.parse(raw);
      const plugins = tsconfig?.compilerOptions?.plugins ?? [];
      return plugins.some((p: any) => p.name === "@effect/language-service");
    } catch {
      return false;
    }
  };

  const ensureServer = async (cwd: string): Promise<TsServer> => {
    if (server && projectRoot === cwd) return server;
    if (server) {
      server.shutdown();
    }
    projectRoot = cwd;
    server = new TsServer(cwd);
    await server.start();
    return server;
  };

  const lineColFromOffset = (
    content: string,
    offset: number,
  ): { line: number; col: number } => {
    const lines = content.slice(0, offset).split("\n");
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
  };

  // ── Lifecycle ───────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    if (detectEffectProject(ctx.cwd)) {
      ctx.ui.setStatus("effect-lsp", "Effect LSP: detected");
    }
  });

  pi.on("session_shutdown", async () => {
    if (server) {
      server.shutdown();
      server = null;
    }
  });

  // ── Commands ────────────────────────────────────────────

  pi.registerCommand("effect-lsp", {
    description: "Show Effect LSP status",
    handler: async (_args, ctx) => {
      const detected = detectEffectProject(ctx.cwd);
      const running = server !== null;
      ctx.ui.notify(
        `Effect LSP: ${enabled ? "enabled" : "disabled"} | ` +
          `Project: ${detected ? "detected" : "not detected"} | ` +
          `Server: ${running ? "running" : "stopped"}`,
        "info",
      );
    },
  });

  // ── Tools ───────────────────────────────────────────────

  pi.registerTool({
    name: "effect_diagnostics",
    label: "Effect Diagnostics",
    description:
      "Get TypeScript + Effect diagnostics for a file. Returns errors, warnings, " +
      "and Effect-specific diagnostics (floating effects, missing services, etc). " +
      "Use this when working on Effect codebases to check for issues.",
    parameters: Type.Object({
      path: Type.String({ description: "File path (relative to project root)" }),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!enabled) {
        return {
          content: [{ type: "text", text: "Effect LSP is disabled. Use /effect-lsp to enable." }],
        };
      }

      try {
        const filePath = resolve(ctx.cwd, params.path.replace(/^@/, ""));
        const srv = await ensureServer(ctx.cwd);

        if (signal?.aborted) {
          return { content: [{ type: "text", text: "Cancelled" }] };
        }

        const diags = await srv.getDiagnostics(filePath);
        if (diags.length === 0) {
          return {
            content: [{ type: "text", text: `No diagnostics for ${params.path}` }],
            details: { diagnostics: [] },
          };
        }

        const formatted = diags.map((d) => {
          const loc = d.start
            ? `${params.path}:${d.start.line}:${d.start.offset}`
            : params.path;
          const severity = d.category === "error" ? "ERROR" : d.category === "warning" ? "WARN" : "INFO";
          return `[${severity}] ${loc}: ${d.text}${d.code ? ` (TS${d.code})` : ""}`;
        });

        return {
          content: [
            {
              type: "text",
              text: `${diags.length} diagnostic(s) for ${params.path}:\n\n${formatted.join("\n")}`,
            },
          ],
          details: { diagnostics: diags },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error getting diagnostics: ${e.message}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "effect_quickinfo",
    label: "Effect Quick Info",
    description:
      "Get type information and documentation at a specific position in a file. " +
      "For Effect code, this includes extended Effect types, Layer graphs, and " +
      "yield* type info. Use to understand types when working with Effect.",
    parameters: Type.Object({
      path: Type.String({ description: "File path (relative to project root)" }),
      line: Type.Number({ description: "Line number (1-based)" }),
      column: Type.Number({ description: "Column number (1-based)" }),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!enabled) {
        return {
          content: [{ type: "text", text: "Effect LSP is disabled." }],
        };
      }

      try {
        const filePath = resolve(ctx.cwd, params.path.replace(/^@/, ""));
        const srv = await ensureServer(ctx.cwd);

        if (signal?.aborted) {
          return { content: [{ type: "text", text: "Cancelled" }] };
        }

        const info = await srv.getQuickInfo(filePath, params.line, params.column);
        if (!info) {
          return {
            content: [{ type: "text", text: `No info at ${params.path}:${params.line}:${params.column}` }],
          };
        }

        let text = "";
        if (info.displayString) text += `**Type:** ${info.displayString}\n\n`;
        if (info.documentation) text += `**Docs:** ${info.documentation}\n\n`;
        if (info.tags && info.tags.length > 0) {
          text += `**Tags:**\n${info.tags.map((t) => `  @${t.name}${t.text ? ` ${t.text}` : ""}`).join("\n")}`;
        }

        return {
          content: [{ type: "text", text: text || "No information available" }],
          details: { quickInfo: info },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error getting quick info: ${e.message}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "effect_completions",
    label: "Effect Completions",
    description:
      "Get completions at a position in a file. Includes Effect-specific " +
      "completions like Self types, Effect.gen bodies, and brand names.",
    parameters: Type.Object({
      path: Type.String({ description: "File path (relative to project root)" }),
      line: Type.Number({ description: "Line number (1-based)" }),
      column: Type.Number({ description: "Column number (1-based)" }),
      prefix: Type.Optional(Type.String({ description: "Filter completions by prefix" })),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (!enabled) {
        return {
          content: [{ type: "text", text: "Effect LSP is disabled." }],
        };
      }

      try {
        const filePath = resolve(ctx.cwd, params.path.replace(/^@/, ""));
        const srv = await ensureServer(ctx.cwd);

        if (signal?.aborted) {
          return { content: [{ type: "text", text: "Cancelled" }] };
        }

        const completions = await srv.getCompletions(
          filePath,
          params.line,
          params.column,
          params.prefix,
        );

        if (completions.length === 0) {
          return {
            content: [{ type: "text", text: "No completions available" }],
            details: { completions: [] },
          };
        }

        const maxShow = 50;
        const shown = completions.slice(0, maxShow);
        const formatted = shown
          .map((c) => `  ${c.name}${c.kind ? ` (${c.kind})` : ""}${c.sortText ? "" : ""}`)
          .join("\n");

        const extra =
          completions.length > maxShow
            ? `\n  ... and ${completions.length - maxShow} more`
            : "";

        return {
          content: [
            {
              type: "text",
              text: `${completions.length} completion(s):\n\n${formatted}${extra}`,
            },
          ],
          details: { completions: shown, total: completions.length },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error getting completions: ${e.message}` }],
          isError: true,
        };
      }
    },
  });
}
