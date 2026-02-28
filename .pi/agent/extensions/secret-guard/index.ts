import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

import { isHardBlockedPath, classifyBashCommand, containsInlineSecret } from "./patterns.js";
import { redactText } from "./redaction.js";
import {
  isWhitelistedFile,
  isWhitelistedCommand,
  addToWhitelist,
  clearWhitelist,
  getWhitelist,
} from "./whitelist.js";

const SYSTEM_PROMPT_ADDENDUM = `

<secret-guard>
IMPORTANT: Secret values in .env files and tool output are automatically redacted.
You can freely read, cat, grep .env files — secret values appear as <REDACTED>, config values stay visible.

Hard-blocked (not redactable):
  ~/.ssh/, ~/.aws/, ~/.gnupg/, *.pem, *.key — use /secrets-whitelist to override

Blocked commands (dump process env indiscriminately):
  env, printenv, echo $VAR, export -p, declare -x, process.env, os.environ

To copy a secret value between .env files without exposing it, use /secrets-copy.
To set a value, tell the user to open the file in their editor.
</secret-guard>`;

const blocked = (reason: string) => ({
  block: true as const,
  reason: `🔒 ${reason} Use /secrets-whitelist to override.`,
});

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

  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("read", event)) {
      const path = resolve(ctx.cwd, event.input.path);
      if (isHardBlockedPath(path) && !isWhitelistedFile(path, ctx.cwd)) {
        return blocked(`"${event.input.path}" contains private keys/credentials.`);
      }
    }

    if (event.toolName === "edit") {
      const path = resolve(ctx.cwd, (event.input as any).path);
      if (isHardBlockedPath(path) && !isWhitelistedFile(path, ctx.cwd)) {
        return blocked(`Cannot edit "${(event.input as any).path}".`);
      }
    }

    if (isToolCallEventType("bash", event)) {
      const check = classifyBashCommand(event.input.command);
      if (check.dangerous && !isWhitelistedCommand(event.input.command, ctx.cwd)) {
        return blocked(check.reason);
      }
    }

    return undefined;
  });

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
    description: "Show secret guard status and whitelist",
    handler: async (_args, ctx) => {
      const wl = getWhitelist(ctx.cwd);
      const lines = [
        "🔒 Secret Guard",
        "",
        "• .env files: readable, secret values auto-redacted",
        "• ~/.ssh, ~/.aws, *.pem, *.key: hard-blocked",
        "• env/printenv/echo $VAR: blocked",
        "• /secrets-copy: move values between .env files safely",
      ];

      if (wl.files.length > 0 || wl.commands.length > 0) {
        lines.push("", "Whitelist:");
        wl.files.forEach((f) => lines.push(`  📄 ${f}`));
        wl.commands.forEach((c) => lines.push(`  💻 ${c}`));
      }

      ctx.ui.notify(lines.join("\n"), "info");
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

  pi.registerCommand("secrets-whitelist", {
    description: "Add a file or command to the whitelist",
    handler: async (args, ctx) => {
      const scope = await ctx.ui.select("Scope:", ["Project", "Global", "Cancel"]);
      if (!scope || scope === "Cancel") return;

      const type = await ctx.ui.select("Type:", ["File", "Command", "Cancel"]);
      if (!type || type === "Cancel") return;

      const value = await ctx.ui.input(
        type === "File" ? "File name or path:" : "Command or substring:",
        args || ""
      );
      if (!value) return;

      const added = addToWhitelist(
        scope.toLowerCase() as "project" | "global",
        type === "File" ? "files" : "commands",
        value,
        ctx.cwd
      );

      ctx.ui.notify(
        added
          ? `Added "${value}" to ${scope.toLowerCase()} whitelist`
          : `"${value}" already whitelisted`,
        "info"
      );
    },
  });

  pi.registerCommand("secrets-clear", {
    description: "Clear whitelist",
    handler: async (_args, ctx) => {
      const choice = await ctx.ui.select("Clear:", [
        "Project only", "Global only", "Both", "Cancel",
      ]);
      if (!choice || choice === "Cancel") return;

      const scope = choice === "Both" ? "both"
        : choice === "Global only" ? "global" : "project";

      clearWhitelist(scope, ctx.cwd);
      ctx.ui.notify(`Cleared ${scope} whitelist`, "info");
    },
  });
}
