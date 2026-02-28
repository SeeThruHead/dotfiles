import type { DangerousCommand } from "./types.js";

type Verdict = "safe" | "secret" | "skip";
type ValueRule = (key: string, value: string) => Verdict;
type TextRule = (text: string) => boolean;

// --- Value classification pipeline ---
// Evaluated top-to-bottom, first non-"skip" verdict wins.

const valueRules: ValueRule[] = [
  // Empty values are never secrets
  (_k, v) => v.trim().length === 0 ? "safe" : "skip",

  // Trivially safe values: booleans, numbers, common env names
  (_k, v) => /^(true|false|yes|no|on|off|0|1)$/i.test(v.trim()) ? "safe" : "skip",
  (_k, v) => /^\d+$/.test(v.trim()) ? "safe" : "skip",
  (_k, v) => /^(development|production|staging|test|debug|info|warn|error)$/i.test(v.trim()) ? "safe" : "skip",
  (_k, v) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(v.trim()) ? "safe" : "skip",
  (_k, v) => v.trim().length < 8 && /^[a-zA-Z0-9._-]+$/.test(v.trim()) ? "safe" : "skip",

  // Common local dev defaults: password, redis, root, changeme, etc.
  (_k, v) => [
    "redis", "password", "passwd", "pass", "secret",
    "root", "admin", "test", "guest", "default",
    "changeme", "example", "placeholder",
    "your_secret_here", "your_password_here",
    "xxx", "xxxxxxxx", "todo", "fixme",
  ].includes(v.trim().toLowerCase()) ? "safe" : "skip",

  // Local connection strings (localhost, 127.0.0.1, etc.)
  (_k, v) => {
    const isConnString = /^(postgres|mysql|mongodb|redis|amqp|http|https):\/\//.test(v.trim());
    const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|host\.docker\.internal)(:|\/|$)/.test(v.trim());
    return isConnString && isLocal ? "safe" : "skip";
  },

  // Known secret value prefixes
  (_k, v) => /^sk-[a-zA-Z0-9\-_]{20,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^sk_(live|test)_[a-zA-Z0-9]{20,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^(pk|rk)_live_[a-zA-Z0-9]{20,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^AKIA[A-Z0-9]{16}$/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^gh[psoiu]_[a-zA-Z0-9]{36,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^glpat-[a-zA-Z0-9\-_]{20,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^xox[bpras]-[a-zA-Z0-9\-]{20,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^SG\.[a-zA-Z0-9\-_]{22,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^bearer\s+[a-zA-Z0-9\-_.]{20,}/i.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^whsec_[a-zA-Z0-9]{20,}/.test(v.trim()) ? "secret" : "skip",
  (_k, v) => /^eyJ[a-zA-Z0-9\-_]{20,}/.test(v.trim()) ? "secret" : "skip",

  // Connection strings with credentials pointing at remote hosts
  (_k, v) => /^(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/.test(v.trim()) ? "secret" : "skip",

  // Private key blocks
  (_k, v) => /^-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/.test(v.trim()) ? "secret" : "skip",

  // Safe key names — these are config regardless of value
  (k, _v) => [
    /^port$/i, /^host$/i, /^hostname$/i, /^url$/i,
    /^base[_-]?url$/i, /^api[_-]?url$/i, /^app[_-]?url$/i,
    /^domain$/i, /^debug$/i, /^verbose$/i, /^log[_-]?level$/i,
    /^node[_-]?env$/i, /^env$/i, /^environment$/i,
    /^region$/i, /^timezone$/i, /^tz$/i, /^lang$/i, /^locale$/i,
    /^enabled$/i, /^disabled$/i,
    /^app[_-]?name$/i, /^project[_-]?name$/i, /^version$/i,
    /^max/i, /^min/i, /^timeout/i, /^retries$/i,
    /^workers$/i, /^threads$/i, /^pool[_-]?size$/i,
  ].some((p) => p.test(k)) ? "safe" : "skip",

  // Secret key names — if we got this far, the value is non-trivial
  (k, _v) => [
    /secret/i, /password/i, /passwd/i, /token/i,
    /api[_-]?key/i, /private[_-]?key/i, /access[_-]?key/i,
    /auth/i, /credential/i,
  ].some((p) => p.test(k)) ? "secret" : "skip",

  // Long random-looking strings
  (_k, v) => v.trim().length >= 32 && /^[a-zA-Z0-9\-_./+=]{32,}$/.test(v.trim()) ? "secret" : "skip",

  // URLs with embedded credentials
  (_k, v) => /^https?:\/\/[^:]+:[^@]+@/.test(v.trim()) ? "secret" : "skip",
];

export function classifyValue(key: string, value: string): "safe" | "secret" {
  for (const rule of valueRules) {
    const verdict = rule(key, value);
    if (verdict !== "skip") return verdict;
  }
  return "safe";
}

// --- Inline secret detection (for scanning arbitrary text output) ---

const inlineSecretPatterns: TextRule[] = [
  (t) => /\bsk-[a-zA-Z0-9\-_]{20,}/.test(t),
  (t) => /\bsk_(live|test)_[a-zA-Z0-9]{20,}/.test(t),
  (t) => /\bAKIA[A-Z0-9]{16}\b/.test(t),
  (t) => /\bgh[psoiu]_[a-zA-Z0-9]{36,}/.test(t),
  (t) => /\bglpat-[a-zA-Z0-9\-_]{20,}/.test(t),
  (t) => /\bxox[bpras]-[a-zA-Z0-9\-]{20,}/.test(t),
  (t) => /\bSG\.[a-zA-Z0-9\-_]{22,}/.test(t),
  (t) => /\bwhsec_[a-zA-Z0-9]{20,}/.test(t),
  (t) => /\beyJ[a-zA-Z0-9\-_]{20,}\./.test(t),
  (t) => /\b(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/.test(t),
  (t) => /-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/.test(t),
];

export const containsInlineSecret = (text: string) =>
  inlineSecretPatterns.some((rule) => rule(text));

// --- Blocked paths (always blocked, not config files) ---

const blockedPathPatterns: TextRule[] = [
  (p) => /\/\.ssh\//.test(p),
  (p) => /\/\.aws\//.test(p),
  (p) => /\/\.gnupg\//.test(p),
  (p) => /\/\.config\/gh\//.test(p),
  (p) => /id_rsa/.test(p),
  (p) => /id_ed25519/.test(p),
  (p) => /\.pem$/.test(p),
  (p) => /\.key$/.test(p),
];

export const isBlockedPath = (path: string) =>
  blockedPathPatterns.some((rule) => rule(path));

// --- Dangerous bash commands ---

const dangerousCommandPatterns: { rule: TextRule; reason: string }[] = [
  { rule: (c) => /\becho\s+.*\$[{A-Za-z_]/.test(c), reason: "Command could dump all environment variables" },
  { rule: (c) => /\bprintf\s+.*\$[{A-Za-z_]/.test(c), reason: "Command could dump all environment variables" },
  { rule: (c) => /(?<!\.)(?<!\w)(env|printenv)(?!\w)/.test(c), reason: "Command could dump all environment variables" },
  { rule: (c) => /\bset\s*($|\||;|&)/.test(c), reason: "Command could dump all environment variables" },
  { rule: (c) => /\bexport\s+-p\b/.test(c), reason: "Command could dump all environment variables" },
  { rule: (c) => /\bdeclare\s+-x\b/.test(c), reason: "Command could dump all environment variables" },
  { rule: (c) => /\bdocker\s+inspect\b/.test(c), reason: "Command could expose container secrets" },
  { rule: (c) => /\bcurl\b.*(-H|--header)\s+['"]?(Authorization|X-Api-Key)/i.test(c), reason: "Command contains inline credentials" },
  { rule: (c) => /\bnode\b.*process\.env/.test(c), reason: "Command could dump all environment variables" },
  { rule: (c) => /\bpython[3]?\b.*os\.environ/.test(c), reason: "Command could dump all environment variables" },
];

export function classifyBashCommand(command: string): DangerousCommand {
  if (/\bsecret-env\b/.test(command)) return { dangerous: false, reason: "" };

  const unquoted = command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

  if (isBlockedPath(unquoted))
    return { dangerous: true, reason: "Command accesses a protected secret file" };

  for (const { rule, reason } of dangerousCommandPatterns) {
    if (rule(command)) return { dangerous: true, reason };
  }

  return { dangerous: false, reason: "" };
}
