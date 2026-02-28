/**
 * Secret Guard Extension
 *
 * Prevents secrets from leaking into the LLM context by:
 *
 * 1. Blocking read/edit of .env files and known secret files
 * 2. Blocking bash commands that could expose env vars or secret files
 * 3. Redacting known secret values from ALL tool results as a safety net
 * 4. Allowing writes to new .env files (LLM has no secrets to leak)
 * 5. Whitelist support via /secrets-whitelist command
 *
 * The `secret-env` CLI (in ~/.local/bin) is the safe alternative:
 *   secret-env read <file>                   Show .env with values redacted (<SET>/<EMPTY>)
 *   secret-env check <file> <KEY>            Check if a variable exists and has a value
 *   secret-env list [dir]                    List all .env files and their variable names
 *   secret-env copy <source> <target> <KEY>  Copy a variable between .env files on disk
 *   secret-env keys <file>                   List just the variable names
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isToolCallEventType } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { homedir } from "node:os";

// --- Whitelist ---

interface Whitelist {
  files: string[];
  commands: string[];
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

function getMergedWhitelist(cwd: string): Whitelist {
  const global = loadWhitelist(GLOBAL_WHITELIST_PATH);
  const project = loadWhitelist(getProjectWhitelistPath(cwd));
  return {
    files: [...global.files, ...project.files],
    commands: [...global.commands, ...project.commands],
  };
}

function isWhitelistedFile(filePath: string, cwd: string): boolean {
  const wl = getMergedWhitelist(cwd);
  for (const entry of wl.files) {
    if (filePath === entry || filePath.endsWith(entry) || basename(filePath) === entry) {
      return true;
    }
  }
  return false;
}

function isWhitelistedCommand(command: string, cwd: string): boolean {
  const wl = getMergedWhitelist(cwd);
  for (const entry of wl.commands) {
    if (command.includes(entry)) return true;
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

// --- Secret Content Detection (safety net for output) ---

// Patterns that indicate content contains secrets
const SECRET_CONTENT_PATTERNS = [
  // API key prefixes (common providers)
  /\bsk-[a-zA-Z0-9\-_]{20,}/,                  // OpenAI, Stripe secret keys
  /\bsk_live_[a-zA-Z0-9]{20,}/,               // Stripe live keys
  /\bsk_test_[a-zA-Z0-9]{20,}/,               // Stripe test keys
  /\bpk_live_[a-zA-Z0-9]{20,}/,               // Stripe publishable
  /\brk_live_[a-zA-Z0-9]{20,}/,               // Stripe restricted
  /\bAKIA[A-Z0-9]{16}\b/,                     // AWS access key IDs
  /\bghp_[a-zA-Z0-9]{36,}/,                   // GitHub personal tokens
  /\bghs_[a-zA-Z0-9]{36,}/,                   // GitHub server tokens
  /\bgho_[a-zA-Z0-9]{36,}/,                   // GitHub OAuth tokens
  /\bghu_[a-zA-Z0-9]{36,}/,                   // GitHub user tokens
  /\bglpat-[a-zA-Z0-9\-_]{20,}/,             // GitLab personal tokens
  /\bxox[bpras]-[a-zA-Z0-9\-]{20,}/,         // Slack tokens
  /\bSG\.[a-zA-Z0-9\-_]{22,}/,               // SendGrid
  /\bbearer\s+[a-zA-Z0-9\-_.]{20,}/i,        // Bearer tokens
  // Connection strings with credentials
  /\b(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/,
  // Private keys
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
  /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,
];

// Detects if output looks like env file content with real values
const ENV_LINE_PATTERN = /^(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=\S+/;

function looksLikeSecretContent(text: string): boolean {
  // Check for known secret patterns
  for (const pattern of SECRET_CONTENT_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // Check if output looks like env file content (multiple KEY=VALUE lines with real values)
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  let envLineCount = 0;
  for (const line of lines) {
    if (ENV_LINE_PATTERN.test(line.trim())) {
      envLineCount++;
    }
  }
  // If more than half the non-empty lines look like env vars, it's probably env content
  if (envLineCount >= 2 && envLineCount / lines.length > 0.4) {
    return true;
  }

  return false;
}

// --- Dangerous Bash Command Detection ---

const SECRET_FILE_BASH_PATTERNS = [
  // .env file access — match path-like references (not inside quotes/messages)
  // Covers: cat .env, cp .env, dd if=.env, tee .env, mv .env, etc.
  /[\/\s=]\.env\b/,
  /^\.env\b/,
  // Glob evasion (.en? .en*)
  /[\/\s]\.en[?*]/,
  // Secret/credential files
  /\bcat\s+.*secret/i,
  /\bcat\s+.*credential/i,
  /\bcat\s+.*\.netrc\b/,
  /\bcat\s+.*\.pgpass\b/,
  /\bcat\s+.*id_rsa/,
  /\bcat\s+.*id_ed25519/,
  /\bcat\s+.*\.pem\b/,
  /\bcat\s+.*\.key\b/,
  /\bdd\s+.*secret/i,
  /\bdd\s+.*credential/i,
  /\bdd\s+.*\.netrc\b/,
  /\bdd\s+.*\.pgpass\b/,
  /\bdd\s+.*id_rsa/,
  /\bdd\s+.*id_ed25519/,
  /\bdd\s+.*\.pem\b/,
  /\bdd\s+.*\.key\b/,
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

// Strip quoted strings from a command so we don't match .env inside commit messages etc.
function stripQuotedStrings(command: string): string {
  return command
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");
}

function isDangerousBashCommand(command: string): { dangerous: boolean; reason: string } {
  if (/\bsecret-env\b/.test(command)) {
    return { dangerous: false, reason: "" };
  }

  // Check file patterns against command with quoted strings removed
  const unquoted = stripQuotedStrings(command);
  for (const pattern of SECRET_FILE_BASH_PATTERNS) {
    if (pattern.test(unquoted)) {
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
    } else {
      ctx.ui.setStatus("secret-guard", ctx.ui.theme.fg("muted", `🔒 active`));
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

  // --- Block tool calls (no prompts, just block with short message) ---
  pi.on("tool_call", async (event, ctx) => {
    // Block read of secret files
    if (isToolCallEventType("read", event)) {
      const filePath = resolve(ctx.cwd, event.input.path);
      if (isSecretFile(filePath) && !isWhitelistedFile(filePath, ctx.cwd)) {
        return {
          block: true,
          reason: `🔒 Blocked: "${event.input.path}" is a secret file. Use \`secret-env read ${event.input.path}\` via bash instead. To whitelist, ask the user to run /secrets-whitelist.`,
        };
      }
    }

    // Block edit of secret files (could expose existing values in oldText)
    if (event.toolName === "edit") {
      const filePath = resolve(ctx.cwd, (event.input as any).path);
      if (isSecretFile(filePath) && !isWhitelistedFile(filePath, ctx.cwd)) {
        return {
          block: true,
          reason: `🔒 Blocked: Cannot edit "${(event.input as any).path}" — existing values could leak. Ask the user to edit directly. To whitelist, ask the user to run /secrets-whitelist.`,
        };
      }
    }

    // Allow writing NEW .env files (LLM has no secrets to put in them)
    // Block only if file exists (editing via overwrite could expose on re-read)
    // Actually: writes are fine — the LLM doesn't have secrets. Reads are the problem.

    // Block dangerous bash commands
    if (isToolCallEventType("bash", event)) {
      const check = isDangerousBashCommand(event.input.command);
      if (check.dangerous && !isWhitelistedCommand(event.input.command, ctx.cwd)) {
        return {
          block: true,
          reason: `🔒 Blocked: ${check.reason}. Use \`secret-env\` CLI instead. To whitelist, ask the user to run /secrets-whitelist.`,
        };
      }
    }

    return undefined;
  });

  // --- Safety net: scan ALL tool results for secrets ---
  pi.on("tool_result", async (event, _ctx) => {
    let modified = false;
    const newContent = event.content.map((c) => {
      if (c.type !== "text") return c;
      let text = c.text;

      // 1. Redact known secret values from .env files
      if (secrets.size > 0) {
        const redacted = redactSecrets(text, secrets);
        if (redacted !== text) {
          modified = true;
          text = redacted;
        }
      }

      // 2. Scan for content that looks like it contains secrets
      if (looksLikeSecretContent(text)) {
        modified = true;
        text = "🔒 Blocked: Output contained what appears to be secret values (API keys, tokens, credentials, or env file content). Use `secret-env` CLI for safe access.";
      }

      if (modified) return { ...c, text };
      return c;
    });

    if (modified) {
      return { content: newContent };
    }
  });

  // --- Commands ---

  pi.registerCommand("secrets-reload", {
    description: "Reload secret values from all .env files",
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
      const wl = getMergedWhitelist(ctx.cwd);
      const lines = [
        "🔒 Secret Guard Status",
        "",
        `Protected values: ${secrets.size} (from .env files)`,
        `Env files: ${envFiles.length}`,
        ...envFiles.map((f) => `  📄 ${f}`),
      ];

      if (wl.files.length > 0 || wl.commands.length > 0) {
        lines.push("", "Whitelist:");
        for (const f of wl.files) lines.push(`  📄 ${f}`);
        for (const c of wl.commands) lines.push(`  💻 ${c}`);
      }

      lines.push("", "CLI: secret-env read|check|list|copy|keys");
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });

  pi.registerCommand("secrets-whitelist", {
    description: "Add a file or command to the whitelist",
    handler: async (args, ctx) => {
      const scope = await ctx.ui.select("Whitelist scope:", ["Project", "Global", "Cancel"]);
      if (!scope || scope === "Cancel") return;

      const type = await ctx.ui.select("What to whitelist:", ["File", "Command", "Cancel"]);
      if (!type || type === "Cancel") return;

      const value = await ctx.ui.input(
        type === "File" ? "File name or path:" : "Command or substring:",
        args || ""
      );
      if (!value) return;

      const path = scope === "Project"
        ? getProjectWhitelistPath(ctx.cwd)
        : GLOBAL_WHITELIST_PATH;

      const wl = loadWhitelist(path);
      const list = type === "File" ? wl.files : wl.commands;

      if (!list.includes(value)) {
        list.push(value);
        saveWhitelist(path, wl);
        ctx.ui.notify(`Added "${value}" to ${scope.toLowerCase()} ${type.toLowerCase()} whitelist`, "info");
      } else {
        ctx.ui.notify(`"${value}" is already whitelisted`, "info");
      }
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
        saveWhitelist(getProjectWhitelistPath(ctx.cwd), empty);
        ctx.ui.notify("Cleared project whitelist", "info");
      }

      if (choice === "Global only" || choice === "Both") {
        saveWhitelist(GLOBAL_WHITELIST_PATH, empty);
        ctx.ui.notify("Cleared global whitelist", "info");
      }
    },
  });
}
