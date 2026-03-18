import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { redactText } from "./redaction.js";

const SYSTEM_PROMPT_ADDENDUM = `

<secret-guard>
IMPORTANT: Secret values in ALL tool output are automatically redacted.
You can freely read, cat, grep any file — secret values appear as <REDACTED>, config values stay visible.

This applies to everything: .env files, private keys, SSH configs, AWS credentials,
environment variable dumps, connection strings, API tokens in code, etc.

You will never see raw secret values. Use /secrets-copy to move values between
.env files without exposing them. To set a value, tell the user to open the file
in their editor.
</secret-guard>`;

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus(
      "secret-guard",
      ctx.ui.theme.fg("muted", "🔒 active")
    );
  });

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt + SYSTEM_PROMPT_ADDENDUM,
  }));

  pi.on("tool_result", async (event) => {
    let modified = false;
    const newContent = event.content.map((c) => {
      if (c.type !== "text") return c;
      const result = redactText(c.text);
      if (result.redacted) {
        modified = true;
        return { ...c, text: result.text };
      }
      return c;
    });

    return modified ? { content: newContent } : undefined;
  });

  // --- Commands ---

  pi.registerCommand("secrets", {
    description: "Show secret guard status",
    handler: async (_args, ctx) => {
      ctx.ui.notify([
        "🔒 Secret Guard",
        "",
        "All tool output is scanned. Secret values are auto-redacted.",
        "Config values (ports, hostnames, booleans) stay visible.",
        "",
        "• /secrets-copy — move values between .env files safely",
      ].join("\n"), "info");
    },
  });

  pi.registerCommand("secrets-copy", {
    description: "Copy a variable between .env files (value never shown)",
    handler: async (args, ctx) => {
      const source = await ctx.ui.input("Source file:", "");
      if (!source) return;

      const key = await ctx.ui.input("Variable name:", args || "");
      if (!key) return;

      const target = await ctx.ui.input("Target file:", "");
      if (!target) return;

      const sourcePath = resolve(ctx.cwd, source);
      const targetPath = resolve(ctx.cwd, target);

      if (!existsSync(sourcePath)) {
        ctx.ui.notify(`File not found: ${source}`, "error");
        return;
      }

      const sourceLines = readFileSync(sourcePath, "utf-8").split("\n");
      const match = sourceLines.find((line) => {
        const m = line.trim().match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
        return m && m[2] === key;
      });

      if (!match) {
        ctx.ui.notify(`${key} not found in ${source}`, "error");
        return;
      }

      const parsed = match.trim().match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
      if (!parsed) return;
      const valueLine = `${key}=${parsed[3]}`;

      if (existsSync(targetPath)) {
        const targetLines = readFileSync(targetPath, "utf-8").split("\n");
        const idx = targetLines.findIndex((line) => {
          const m = line.trim().match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/);
          return m && m[2] === key;
        });

        if (idx >= 0) {
          targetLines[idx] = valueLine;
        } else {
          targetLines.push(valueLine);
        }
        writeFileSync(targetPath, targetLines.join("\n"), "utf-8");
        ctx.ui.notify(`Updated ${key} in ${target} (value not shown)`, "info");
      } else {
        writeFileSync(targetPath, valueLine + "\n", "utf-8");
        ctx.ui.notify(`Created ${target} with ${key} (value not shown)`, "info");
      }
    },
  });
}
