import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { resolve } from "node:path";
import { execSync } from "node:child_process";

import { isBlockedPath, classifyBashCommand } from "./patterns.js";
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
IMPORTANT: Secret files (.env, .env.*, secrets.json, credentials.*, ~/.ssh/, ~/.aws/) are BLOCKED from read, write, edit, cat, grep, and all other direct access.

To work with .env files, use the \`secret-env\` CLI via bash:
  secret-env read <file>                   — Show .env with values redacted (<SET>/<EMPTY>)
  secret-env check <file> <KEY>            — Check if a variable exists and has a value
  secret-env list [dir]                    — List all .env files and their variable names
  secret-env copy <source> <target> <KEY>  — Copy a variable between .env files (on disk, value never printed)
  secret-env keys <file>                   — List just the variable names

NEVER attempt to: cat .env, read .env, echo $SECRET, env, printenv, or any command that prints secret values.
If you need the user to set a value, tell them to open the file in their editor.
</secret-guard>`;

function countEnvFiles(cwd: string): number {
  try {
    const result = execSync(
      `find "${cwd}" -maxdepth 3 -name '.env' -o -name '.env.*' 2>/dev/null | grep -v node_modules | grep -v .git/ | wc -l`,
      { encoding: "utf-8", timeout: 3000 }
    );
    return parseInt(result.trim()) || 0;
  } catch {
    return 0;
  }
}

const blocked = (reason: string) => ({
  block: true as const,
  reason: `🔒 ${reason} To whitelist, ask the user to run /secrets-whitelist.`,
});

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const count = countEnvFiles(ctx.cwd);
    ctx.ui.setStatus(
      "secret-guard",
      ctx.ui.theme.fg("muted", count > 0
        ? `🔒 guarding ${count} env file${count !== 1 ? "s" : ""}`
        : `🔒 active`)
    );
  });

  pi.on("before_agent_start", async (event) => ({
    systemPrompt: event.systemPrompt + SYSTEM_PROMPT_ADDENDUM,
  }));

  pi.on("tool_call", async (event, ctx) => {
    if (isToolCallEventType("read", event)) {
      const path = resolve(ctx.cwd, event.input.path);
      if (isBlockedPath(path) && !isWhitelistedFile(path, ctx.cwd)) {
        return blocked(`Blocked: "${event.input.path}" contains private keys/credentials.`);
      }
    }

    if (event.toolName === "edit") {
      const path = resolve(ctx.cwd, (event.input as any).path);
      if (isBlockedPath(path) && !isWhitelistedFile(path, ctx.cwd)) {
        return blocked(`Blocked: Cannot edit "${(event.input as any).path}".`);
      }
    }

    if (isToolCallEventType("bash", event)) {
      const check = classifyBashCommand(event.input.command);
      if (check.dangerous && !isWhitelistedCommand(event.input.command, ctx.cwd)) {
        return blocked(`${check.reason}.`);
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

  pi.registerCommand("secrets", {
    description: "Show secret guard status and whitelist",
    handler: async (_args, ctx) => {
      const wl = getWhitelist(ctx.cwd);
      const lines = [
        "🔒 Secret Guard",
        "",
        "Smart redaction: secret values redacted, config values visible",
        "Blocked: echo $VAR, env, printenv, ~/.ssh/, ~/.aws/, private keys",
      ];

      if (wl.files.length > 0 || wl.commands.length > 0) {
        lines.push("", "Whitelist:");
        wl.files.forEach((f) => lines.push(`  📄 ${f}`));
        wl.commands.forEach((c) => lines.push(`  💻 ${c}`));
      }

      lines.push("", "CLI: secret-env read|check|list|copy|keys");
      ctx.ui.notify(lines.join("\n"), "info");
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
