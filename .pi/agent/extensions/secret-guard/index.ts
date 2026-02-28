/**
 * Secret Guard Extension
 *
 * Prevents SECRET values from leaking into the LLM context while still
 * allowing Pi to read config files and help debug environment issues.
 *
 * What gets redacted (values only):
 *   - API keys, tokens, passwords, private keys
 *   - Connection strings with embedded credentials
 *   - Long random-looking strings that are likely secrets
 *
 * What stays visible:
 *   - Ports, hostnames, booleans, feature flags, simple config values
 *   - Variable names (always visible)
 *   - File structure and comments
 *
 * Still fully blocked:
 *   - echo $VAR, env, printenv (indiscriminate env dumps)
 *   - ~/.ssh/, ~/.aws/, ~/.gnupg/, private key files
 *
 * The `secret-env` CLI (in ~/.local/bin) provides fully-redacted views:
 *   secret-env read <file>                   Show .env with ALL values redacted
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

// --- Always-blocked files (not config, truly secret) ---

const ALWAYS_BLOCKED_PATTERNS = [
  /\/\.ssh\//,
  /\/\.aws\//,
  /\/\.gnupg\//,
  /\/\.config\/gh\//,
  /id_rsa/,
  /id_ed25519/,
  /\.pem$/,
  /\.key$/,
];

function isAlwaysBlockedFile(filePath: string): boolean {
  return ALWAYS_BLOCKED_PATTERNS.some((p) => p.test(filePath));
}

// --- Secret Value Detection ---

// Patterns that identify a VALUE as a secret (not the key name, the actual value)
const SECRET_VALUE_PATTERNS = [
  // API key prefixes
  /^sk-[a-zA-Z0-9\-_]{20,}/,                  // OpenAI, Stripe
  /^sk_live_[a-zA-Z0-9]{20,}/,                // Stripe live
  /^sk_test_[a-zA-Z0-9]{20,}/,                // Stripe test
  /^pk_live_[a-zA-Z0-9]{20,}/,                // Stripe publishable
  /^rk_live_[a-zA-Z0-9]{20,}/,                // Stripe restricted
  /^AKIA[A-Z0-9]{16}$/,                       // AWS access key ID
  /^ghp_[a-zA-Z0-9]{36,}/,                    // GitHub personal token
  /^ghs_[a-zA-Z0-9]{36,}/,                    // GitHub server token
  /^gho_[a-zA-Z0-9]{36,}/,                    // GitHub OAuth token
  /^ghu_[a-zA-Z0-9]{36,}/,                    // GitHub user token
  /^glpat-[a-zA-Z0-9\-_]{20,}/,              // GitLab personal token
  /^xox[bpras]-[a-zA-Z0-9\-]{20,}/,          // Slack tokens
  /^SG\.[a-zA-Z0-9\-_]{22,}/,                // SendGrid
  /^bearer\s+[a-zA-Z0-9\-_.]{20,}/i,         // Bearer tokens
  /^whsec_[a-zA-Z0-9]{20,}/,                  // Webhook secrets
  /^eyJ[a-zA-Z0-9\-_]{20,}/,                  // JWT tokens
  // Connection strings with credentials
  /^(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/,
  // Private keys
  /^-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /^-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
  /^-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,
];

// Key names that strongly suggest the value is a secret
const SECRET_KEY_PATTERNS = [
  /secret/i,
  /password/i,
  /passwd/i,
  /token/i,
  /api[_-]?key/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /auth/i,
  /credential/i,
];

// Key names that are definitely NOT secrets
const SAFE_KEY_PATTERNS = [
  /^port$/i,
  /^host$/i,
  /^hostname$/i,
  /^url$/i,       // URL without credentials is fine
  /^base[_-]?url$/i,
  /^api[_-]?url$/i,
  /^app[_-]?url$/i,
  /^domain$/i,
  /^debug$/i,
  /^verbose$/i,
  /^log[_-]?level$/i,
  /^node[_-]?env$/i,
  /^env$/i,
  /^environment$/i,
  /^region$/i,
  /^timezone$/i,
  /^tz$/i,
  /^lang$/i,
  /^locale$/i,
  /^enabled$/i,
  /^disabled$/i,
  /^app[_-]?name$/i,
  /^project[_-]?name$/i,
  /^version$/i,
  /^max/i,
  /^min/i,
  /^timeout/i,
  /^retries$/i,
  /^workers$/i,
  /^threads$/i,
  /^pool[_-]?size$/i,
];

// Values that are clearly not secrets
function isSafeValue(value: string): boolean {
  const v = value.trim();
  // Booleans
  if (/^(true|false|yes|no|on|off|0|1)$/i.test(v)) return true;
  // Pure numbers (ports, counts, etc)
  if (/^\d+$/.test(v)) return true;
  // Simple hostnames/IPs
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(v)) return true;
  // Short simple strings (< 8 chars, no special chars) — likely config values
  if (v.length < 8 && /^[a-zA-Z0-9._-]+$/.test(v)) return true;
  // Common env values
  if (/^(development|production|staging|test|debug|info|warn|error)$/i.test(v)) return true;
  return false;
}

function isSecretValue(key: string, value: string): boolean {
  const v = value.trim();

  // Empty values aren't secrets
  if (v.length === 0) return false;

  // Safe values are never secrets
  if (isSafeValue(v)) return false;

  // Check if the value itself matches a known secret pattern
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(v)) return true;
  }

  // Safe key names — these are config, not secrets
  for (const pattern of SAFE_KEY_PATTERNS) {
    if (pattern.test(key)) return false;
  }

  // Secret-looking key names — if the value is non-trivial, redact it
  for (const pattern of SECRET_KEY_PATTERNS) {
    if (pattern.test(key)) return true;
  }

  // Long random-looking strings are probably secrets (32+ chars of alphanumeric/special)
  if (v.length >= 32 && /^[a-zA-Z0-9\-_./+=]{32,}$/.test(v)) return true;

  // URLs with embedded credentials
  if (/^https?:\/\/[^:]+:[^@]+@/.test(v)) return true;

  return false;
}

// Smart-redact a line from an env file: keep key, redact only secret values
function smartRedactLine(line: string): string {
  const trimmed = line.trim();

  // Comments and blanks pass through
  if (trimmed === "" || trimmed.startsWith("#")) return line;

  const match = trimmed.match(/^(export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)/);
  if (!match) return line;

  const prefix = match[1] || "";
  const key = match[2];
  let value = match[3];

  // Strip quotes for analysis
  let inner = value.trim();
  let quoteChar = "";
  if ((inner.startsWith('"') && inner.endsWith('"')) || (inner.startsWith("'") && inner.endsWith("'"))) {
    quoteChar = inner[0];
    inner = inner.slice(1, -1);
  }

  if (isSecretValue(key, inner)) {
    return `${prefix}${key}=${quoteChar}<REDACTED>${quoteChar}`;
  }

  return line;
}

// Smart-redact entire text that might contain env content or inline secrets
function smartRedactText(text: string): { text: string; redacted: boolean } {
  let anyRedacted = false;

  // 1. Check for and block known secret patterns in raw text
  for (const pattern of SECRET_VALUE_PATTERNS) {
    if (pattern.test(text)) {
      // Redact the matching value inline
      text = text.replace(new RegExp(pattern.source, pattern.flags + (pattern.flags.includes("g") ? "" : "g")), "<REDACTED>");
      anyRedacted = true;
    }
  }

  // 2. Smart-redact KEY=VALUE lines
  const lines = text.split("\n");
  const redactedLines = lines.map((line) => {
    const redacted = smartRedactLine(line);
    if (redacted !== line) anyRedacted = true;
    return redacted;
  });

  return { text: anyRedacted ? redactedLines.join("\n") : text, redacted: anyRedacted };
}

// --- Bash command patterns that dump env indiscriminately ---

const ENV_DUMP_PATTERNS = [
  /\becho\s+.*\$[{A-Za-z_]/,
  /\bprintf\s+.*\$[{A-Za-z_]/,
  /\b(env|printenv)\b/,
  /\bset\s*($|\||;|&)/,
  /\bexport\s+-p\b/,
  /\bdeclare\s+-x\b/,
  /\bdocker\s+inspect\b/,
  /\bcurl\b.*(-H|--header)\s+['"]?(Authorization|X-Api-Key)/i,
  /\bnode\b.*process\.env/,
  /\bpython[3]?\b.*os\.environ/,
];

function stripQuotedStrings(command: string): string {
  return command
    .replace(/"[^"]*"/g, '""')
    .replace(/'[^']*'/g, "''");
}

function isDangerousBashCommand(command: string): { dangerous: boolean; reason: string } {
  if (/\bsecret-env\b/.test(command)) {
    return { dangerous: false, reason: "" };
  }

  const unquoted = stripQuotedStrings(command);

  // Block access to always-blocked files
  for (const pattern of ALWAYS_BLOCKED_PATTERNS) {
    if (pattern.test(unquoted)) {
      return { dangerous: true, reason: "Command accesses a protected secret file" };
    }
  }

  // Block env dumps
  for (const pattern of ENV_DUMP_PATTERNS) {
    if (pattern.test(command)) {
      return { dangerous: true, reason: "Command could dump all environment variables" };
    }
  }

  return { dangerous: false, reason: "" };
}

// === EXTENSION ===

export default function (pi: ExtensionAPI) {
  // Load secrets on session start (for status display)
  pi.on("session_start", async (_event, ctx) => {
    let envFileCount = 0;
    try {
      const result = execSync(
        `find "${ctx.cwd}" -maxdepth 3 -name '.env' -o -name '.env.*' 2>/dev/null | grep -v node_modules | grep -v .git/ | wc -l`,
        { encoding: "utf-8", timeout: 3000 }
      );
      envFileCount = parseInt(result.trim()) || 0;
    } catch {}

    ctx.ui.setStatus(
      "secret-guard",
      ctx.ui.theme.fg("muted", envFileCount > 0
        ? `🔒 guarding ${envFileCount} env file${envFileCount !== 1 ? "s" : ""}`
        : `🔒 active`)
    );
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

  // --- Block tool calls ---
  pi.on("tool_call", async (event, ctx) => {
    // Block always-blocked files (ssh keys, aws creds, etc)
    if (isToolCallEventType("read", event)) {
      const filePath = resolve(ctx.cwd, event.input.path);
      if (isAlwaysBlockedFile(filePath) && !isWhitelistedFile(filePath, ctx.cwd)) {
        return {
          block: true,
          reason: `🔒 Blocked: "${event.input.path}" contains private keys/credentials. To whitelist, ask the user to run /secrets-whitelist.`,
        };
      }
    }

    // Block edit of always-blocked files
    if (event.toolName === "edit") {
      const filePath = resolve(ctx.cwd, (event.input as any).path);
      if (isAlwaysBlockedFile(filePath) && !isWhitelistedFile(filePath, ctx.cwd)) {
        return {
          block: true,
          reason: `🔒 Blocked: Cannot edit "${(event.input as any).path}". To whitelist, ask the user to run /secrets-whitelist.`,
        };
      }
    }

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

  // --- Smart-redact secrets from ALL tool results ---
  pi.on("tool_result", async (event, _ctx) => {
    let modified = false;
    const newContent = event.content.map((c) => {
      if (c.type !== "text") return c;

      const result = smartRedactText(c.text);
      if (result.redacted) {
        modified = true;
        return { ...c, text: result.text };
      }
      return c;
    });

    if (modified) {
      return { content: newContent };
    }
  });

  // --- Commands ---

  pi.registerCommand("secrets-reload", {
    description: "Reload secret guard",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Secret guard reloaded. Use /reload for full extension reload.", "info");
    },
  });

  pi.registerCommand("secrets", {
    description: "Show secret guard status and whitelist",
    handler: async (_args, ctx) => {
      const wl = getMergedWhitelist(ctx.cwd);
      const lines = [
        "🔒 Secret Guard Status",
        "",
        "Smart redaction: ON (secret values redacted, config values visible)",
        "Blocked: echo $VAR, env, printenv, ~/.ssh/, ~/.aws/, private keys",
        "",
      ];

      if (wl.files.length > 0 || wl.commands.length > 0) {
        lines.push("Whitelist:");
        for (const f of wl.files) lines.push(`  📄 ${f}`);
        for (const c of wl.commands) lines.push(`  💻 ${c}`);
        lines.push("");
      }

      lines.push("CLI: secret-env read|check|list|copy|keys");
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
