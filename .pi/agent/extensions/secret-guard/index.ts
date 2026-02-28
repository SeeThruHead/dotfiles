/**
 * Secret Guard Extension
 *
 * Prevents secrets from leaking into the LLM context by:
 *
 * 1. Blocking read/write/edit of .env files and known secret files
 * 2. Blocking bash commands that could expose env vars or secret files
 * 3. Redacting known secret values from ALL tool results as a safety net
 * 4. Providing `secret-env` CLI (in ~/.local/bin) as the safe alternative
 * 5. Prompting user to whitelist files/commands when blocked
 *
 * The `secret-env` CLI (bash script) is what the LLM should use instead:
 *   secret-env read <file>                   Show .env with values redacted (<SET>/<EMPTY>)
 *   secret-env check <file> <KEY>            Check if a variable exists and has a value
 *   secret-env list [dir]                    List all .env files and their variable names
 *   secret-env copy <source> <target> <KEY>  Copy a variable between .env files on disk
 *   secret-env keys <file>                   List just the variable names
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

// --- Whitelist ---

interface Whitelist {
  files: string[];     // Whitelisted file paths (exact or glob-like)
  commands: string[];  // Whitelisted bash command patterns
}

const GLOBAL_WHITELIST_PATH = join(homedir(), ".pi", "agent", "secret-guard.json");

function getProjectWhitelistPath(cwd: string): string {
  return join(cwd, ".pi", "secret-guard.json");
}

function loadWhitelist(path: string): Whitelist {
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, "utf-8"));
    }
  } catch {}
  return { files: [], commands: [] };
}

function saveWhitelist(path: string, whitelist: Whitelist): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(whitelist, null, 2) + "\n", "utf-8");
}

function isWhitelistedFile(filePath: string, cwd: string): boolean {
  const global = loadWhitelist(GLOBAL_WHITELIST_PATH);
  const project = loadWhitelist(getProjectWhitelistPath(cwd));
  const allFiles = [...global.files, ...project.files];

  for (const entry of allFiles) {
    // Exact match or ends-with match
    if (filePath === entry || filePath.endsWith(entry) || basename(filePath) === entry) {
      return true;
    }
  }
  return false;
}

function isWhitelistedCommand(command: string, cwd: string): boolean {
  const global = loadWhitelist(GLOBAL_WHITELIST_PATH);
  const project = loadWhitelist(getProjectWhitelistPath(cwd));
  const allCommands = [...global.commands, ...project.commands];

  for (const entry of allCommands) {
    if (command.includes(entry)) {
      return true;
    }
  }
  return false;
}

async function promptWhitelistFile(
  filePath: string,
  cwd: string,
  ctx: ExtensionContext
): Promise<boolean> {
  if (!ctx.hasUI) return false;

  const choice = await ctx.ui.select(
    `🔒 Blocked: "${filePath}"\n\nThis looks like a secret file. Allow access?`,
    [
      "Block (default)",
      "Allow this once",
      "Whitelist for this project",
      "Whitelist globally",
    ]
  );

  if (!choice || choice === "Block (default)") return false;
  if (choice === "Allow this once") return true;

  const entry = basename(filePath);

  if (choice === "Whitelist for this project") {
    const wlPath = getProjectWhitelistPath(cwd);
    const wl = loadWhitelist(wlPath);
    if (!wl.files.includes(entry)) {
      wl.files.push(entry);
      saveWhitelist(wlPath, wl);
      ctx.ui.notify(`Added "${entry}" to project whitelist`, "info");
    }
    return true;
  }

  if (choice === "Whitelist globally") {
    const wl = loadWhitelist(GLOBAL_WHITELIST_PATH);
    if (!wl.files.includes(entry)) {
      wl.files.push(entry);
      saveWhitelist(GLOBAL_WHITELIST_PATH, wl);
      ctx.ui.notify(`Added "${entry}" to global whitelist`, "info");
    }
    return true;
  }

  return false;
}

async function promptWhitelistCommand(
  command: string,
  reason: string,
  cwd: string,
  ctx: ExtensionContext
): Promise<boolean> {
  if (!ctx.hasUI) return false;

  // Truncate long commands for display
  const display = command.length > 80 ? command.slice(0, 80) + "..." : command;

  const choice = await ctx.ui.select(
    `🔒 Blocked: ${reason}\n\nCommand: ${display}\n\nAllow this?`,
    [
      "Block (default)",
      "Allow this once",
      "Whitelist for this project",
      "Whitelist globally",
    ]
  );

  if (!choice || choice === "Block (default)") return false;
  if (choice === "Allow this once") return true;

  // Use a meaningful snippet of the command as the whitelist entry
  const entry = command.trim().slice(0, 100);

  if (choice === "Whitelist for this project") {
    const wlPath = getProjectWhitelistPath(cwd);
    const wl = loadWhitelist(wlPath);
    if (!wl.commands.includes(entry)) {
      wl.commands.push(entry);
      saveWhitelist(wlPath, wl);
      ctx.ui.notify(`Added command to project whitelist`, "info");
    }
    return true;
  }

  if (choice === "Whitelist globally") {
    const wl = loadWhitelist(GLOBAL_WHITELIST_PATH);
    if (!wl.commands.includes(entry)) {
      wl.commands.push(entry);
      saveWhitelist(GLOBAL_WHITELIST_PATH, wl);
      ctx.ui.notify(`Added command to global whitelist`, "info");
    }
    return true;
  }

  return false;
}

// --- Secret File Detection ---

const SECRET_FILE_PATTERNS = [
  /\.env$/,
  /\.env\.[^.]+$/,
  /secrets?\.(json|yaml|yml|toml)$/i,
  /credentials?\.(json|yaml|yml|toml)$/i,
  /\.netrc$/,
  /\.pgpass$/,
];

const SECRET_DIR_PATTERNS = [
  /\/\.ssh\//,
  /\/\.aws\//,
  /\/\.gnupg\//,
  /\/\.config\/gh\//,
];

function isSecretFile(filePath: string): boolean {
  const name = basename(filePath);
  return (
    SECRET_FILE_PATTERNS.some((p) => p.test(name)) ||
    SECRET_DIR_PATTERNS.some((p) => p.test(filePath))
  );
}

// --- .env Parsing (for redaction safety net) ---

function parseEnvFile(content: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    const match = trimmed.match(
      /^(?:#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
    );
    if (match) {
      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (value.length > 0) {
        vars.set(key, value);
      }
    }
  }
  return vars;
}

function findEnvFiles(cwd: string): string[] {
  try {
    const result = execSync(
      `find "${cwd}" -maxdepth 3 -name '.env' -o -name '.env.*' 2>/dev/null | grep -v node_modules | grep -v .git/`,
      { encoding: "utf-8", timeout: 3000 }
    );
    return result.trim().split("\n").filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

function loadSecrets(cwd: string): { secrets: Map<string, string>; files: string[] } {
  const secrets = new Map<string, string>();
  const envFiles = findEnvFiles(cwd);

  for (const file of envFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const vars = parseEnvFile(content);
      for (const [key, value] of vars) {
        secrets.set(key, value);
      }
    } catch {}
  }

  return { secrets, files: envFiles };
}

function redactSecrets(text: string, secrets: Map<string, string>): string {
  let result = text;
  const entries = Array.from(secrets.entries()).sort(
    (a, b) => b[1].length - a[1].length
  );
  for (const [key, value] of entries) {
    if (value.length >= 4) {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "g"), `<REDACTED:${key}>`);
    }
  }
  return result;
}

// --- Dangerous Bash Command Detection ---

const SECRET_FILE_BASH_PATTERNS = [
  /\bcat\s+.*\.env\b/,
  /\bless\s+.*\.env\b/,
  /\bmore\s+.*\.env\b/,
  /\bhead\s+.*\.env\b/,
  /\btail\s+.*\.env\b/,
  /\bsed\s+.*\.env\b/,
  /\bawk\s+.*\.env\b/,
  /\b(source|\.)\s+.*\.env\b/,
  /\bcat\s+.*secret/i,
  /\bcat\s+.*credential/i,
  /\bcat\s+.*\.netrc\b/,
  /\bcat\s+.*\.pgpass\b/,
  /\bcat\s+.*id_rsa\b/,
  /\bcat\s+.*id_ed25519\b/,
  /\bcat\s+.*\.pem\b/,
  /\bcat\s+.*\.key\b/,
];

const ENV_LEAK_PATTERNS = [
  /\becho\s+.*\$[{A-Za-z_]/,
  /\bprintf\s+.*\$[{A-Za-z_]/,
  /\b(env|printenv)\b/,
  /\bset\s*($|\||;|&)/,
  /\bexport\s+-p\b/,
  /\bdeclare\s+-x\b/,
  /\bgrep\s+.*\.env\b/,
  /\bdocker\s+inspect\b/,
  /\bcurl\b.*(-H|--header)\s+['"]?(Authorization|X-Api-Key)/i,
  /\bnode\b.*process\.env/,
  /\bpython[3]?\b.*os\.environ/,
];

function isDangerousBashCommand(command: string): { dangerous: boolean; reason: string } {
  if (/\bsecret-env\b/.test(command)) {
    return { dangerous: false, reason: "" };
  }

  for (const pattern of SECRET_FILE_BASH_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason: `Command accesses a secret file` };
    }
  }

  for (const pattern of ENV_LEAK_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason: `Command could expose environment variables` };
    }
  }

  return { dangerous: false, reason: "" };
}

// === EXTENSION ===

export default function (pi: ExtensionAPI) {
  let secrets = new Map<string, string>();
  let envFiles: string[] = [];

  // Load secrets on session start
  pi.on("session_start", async (_event, ctx) => {
    const result = loadSecrets(ctx.cwd);
    secrets = result.secrets;
    envFiles = result.files;

    const fileCount = envFiles.length;
    if (fileCount > 0) {
      ctx.ui.setStatus(
        "secret-guard",
        ctx.ui.theme.fg("muted", `🔒 ${secrets.size} secrets from ${fileCount} file${fileCount !== 1 ? "s" : ""}`)
      );
      ctx.ui.notify(
        `Secret Guard: Protecting ${secrets.size} values from ${fileCount} env file${fileCount !== 1 ? "s" : ""}`,
        "info"
      );
    } else {
      ctx.ui.setStatus(
        "secret-guard",
        ctx.ui.theme.fg("muted", `🔒 active`)
      );
    }
  });

  // Inject instructions into system prompt
  pi.on("before_agent_start", async (event, _ctx) => {
    return {
      systemPrompt: event.systemPrompt + `

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
</secret-guard>`,
    };
  });

  // --- Block tool calls (with whitelist prompt) ---
  pi.on("tool_call", async (event, ctx) => {
    // Block read of secret files
    if (isToolCallEventType("read", event)) {
      const filePath = resolve(ctx.cwd, event.input.path);
      if (isSecretFile(filePath) && !isWhitelistedFile(filePath, ctx.cwd)) {
        const allowed = await promptWhitelistFile(filePath, ctx.cwd, ctx);
        if (!allowed) {
          return {
            block: true,
            reason: `🔒 Blocked: "${event.input.path}" is a secret file. Use \`secret-env read ${event.input.path}\` via bash instead.`,
          };
        }
      }
    }

    // Block write/edit of secret files
    if (event.toolName === "write" || event.toolName === "edit") {
      const filePath = resolve(ctx.cwd, (event.input as any).path);
      if (isSecretFile(filePath) && !isWhitelistedFile(filePath, ctx.cwd)) {
        const allowed = await promptWhitelistFile(filePath, ctx.cwd, ctx);
        if (!allowed) {
          return {
            block: true,
            reason: `🔒 Blocked: Cannot write/edit "${(event.input as any).path}". Ask the user to edit this file directly in their editor.`,
          };
        }
      }
    }

    // Block dangerous bash commands
    if (isToolCallEventType("bash", event)) {
      const check = isDangerousBashCommand(event.input.command);
      if (check.dangerous && !isWhitelistedCommand(event.input.command, ctx.cwd)) {
        const allowed = await promptWhitelistCommand(
          event.input.command,
          check.reason,
          ctx.cwd,
          ctx
        );
        if (!allowed) {
          return {
            block: true,
            reason: `🔒 Blocked: ${check.reason}. Use \`secret-env\` CLI instead, or ask the user to run this in their own terminal.`,
          };
        }
      }
    }

    return undefined;
  });

  // --- Redact secrets from ALL tool results (safety net) ---
  pi.on("tool_result", async (event, _ctx) => {
    if (secrets.size === 0) return;

    let modified = false;
    const newContent = event.content.map((c) => {
      if (c.type === "text") {
        const redacted = redactSecrets(c.text, secrets);
        if (redacted !== c.text) {
          modified = true;
          return { ...c, text: redacted };
        }
      }
      return c;
    });

    if (modified) {
      return { content: newContent };
    }
  });

  // --- Commands ---

  pi.registerCommand("secrets-reload", {
    description: "Reload secret values from all .env files (run after editing env files)",
    handler: async (_args, ctx) => {
      const result = loadSecrets(ctx.cwd);
      secrets = result.secrets;
      envFiles = result.files;

      const fileCount = envFiles.length;
      if (fileCount > 0) {
        ctx.ui.setStatus(
          "secret-guard",
          ctx.ui.theme.fg("muted", `🔒 ${secrets.size} secrets from ${fileCount} files`)
        );
      } else {
        ctx.ui.setStatus("secret-guard", ctx.ui.theme.fg("muted", `🔒 active`));
      }
      ctx.ui.notify(
        `Reloaded: ${secrets.size} secrets from ${fileCount} file${fileCount !== 1 ? "s" : ""}`,
        "info"
      );
    },
  });

  pi.registerCommand("secrets", {
    description: "Show secret guard status and whitelist",
    handler: async (_args, ctx) => {
      const global = loadWhitelist(GLOBAL_WHITELIST_PATH);
      const project = loadWhitelist(getProjectWhitelistPath(ctx.cwd));

      const lines = [
        "🔒 Secret Guard Status",
        "",
        `Protected values: ${secrets.size} (from .env files)`,
        `Env files found: ${envFiles.length}`,
        ...envFiles.map((f) => `  📄 ${f}`),
        "",
      ];

      if (global.files.length > 0 || global.commands.length > 0) {
        lines.push("Global whitelist:");
        for (const f of global.files) lines.push(`  📄 ${f}`);
        for (const c of global.commands) lines.push(`  💻 ${c}`);
        lines.push("");
      }

      if (project.files.length > 0 || project.commands.length > 0) {
        lines.push("Project whitelist:");
        for (const f of project.files) lines.push(`  📄 ${f}`);
        for (const c of project.commands) lines.push(`  💻 ${c}`);
        lines.push("");
      }

      if (global.files.length === 0 && global.commands.length === 0 &&
          project.files.length === 0 && project.commands.length === 0) {
        lines.push("No whitelisted files or commands.");
        lines.push("");
      }

      lines.push(
        "CLI: secret-env read|check|list|copy|keys",
        "Commands: /secrets, /secrets-reload, /secrets-clear"
      );
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("secrets-clear", {
    description: "Clear whitelist (project, global, or both)",
    handler: async (_args, ctx) => {
      const choice = await ctx.ui.select("Clear which whitelist?", [
        "Project only",
        "Global only",
        "Both",
        "Cancel",
      ]);

      if (!choice || choice === "Cancel") return;

      const empty: Whitelist = { files: [], commands: [] };

      if (choice === "Project only" || choice === "Both") {
        const path = getProjectWhitelistPath(ctx.cwd);
        if (existsSync(path)) {
          saveWhitelist(path, empty);
          ctx.ui.notify("Cleared project whitelist", "info");
        }
      }

      if (choice === "Global only" || choice === "Both") {
        if (existsSync(GLOBAL_WHITELIST_PATH)) {
          saveWhitelist(GLOBAL_WHITELIST_PATH, empty);
          ctx.ui.notify("Cleared global whitelist", "info");
        }
      }
    },
  });
}
