import type { DangerousCommand } from "./types.js";
import { matchesGitleaksValue, matchesGitleaksText } from "./gitleaks.js";

type Verdict = "safe" | "secret" | "skip";
type ValueRule = (key: string, value: string) => Verdict;

const cond = (rules: ValueRule[]) =>
  (key: string, value: string): "safe" | "secret" => {
    for (const rule of rules) {
      const v = rule(key, value);
      if (v !== "skip") return v;
    }
    return "safe";
  };

// --- Value predicates ---

const matchesValue = (pattern: RegExp) => (_k: string, v: string) => pattern.test(v.trim());
const matchesKey = (patterns: RegExp[]) => (k: string, _v: string) =>
  patterns.some((p) => p.test(k));

const isEmpty: ValueRule = (_k, v) => v.trim().length === 0 ? "safe" : "skip";

const isTrivialValue: ValueRule = (_k, v) => {
  const t = v.trim();
  return (
    /^(true|false|yes|no|on|off|0|1)$/i.test(t) ||
    /^\d+$/.test(t) ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(t) ||
    (t.length < 8 && /^[a-zA-Z0-9._-]+$/.test(t)) ||
    /^(development|production|staging|test|debug|info|warn|error)$/i.test(t)
  ) ? "safe" : "skip";
};

const isCommonDefault: ValueRule = (_k, v) => [
  "redis", "password", "passwd", "pass", "secret",
  "root", "admin", "test", "guest", "default",
  "changeme", "example", "placeholder",
  "your_secret_here", "your_password_here",
  "xxx", "xxxxxxxx", "todo", "fixme",
].includes(v.trim().toLowerCase()) ? "safe" : "skip";

const isLocalConnectionString: ValueRule = (_k, v) => {
  const t = v.trim();
  const isConn = /^(postgres|mysql|mongodb|redis|amqp|http|https):\/\//.test(t);
  const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|host\.docker\.internal)(:|\/|$)/.test(t);
  return isConn && isLocal ? "safe" : "skip";
};

const matchesGitleaks: ValueRule = (_k, v) =>
  matchesGitleaksValue(v.trim()) !== null ? "secret" : "skip";

const hasRemoteConnString: ValueRule = (k, v) =>
  /^(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/.test(v.trim()) ? "secret" : "skip";

const hasPrivateKeyHeader: ValueRule = (k, v) =>
  /^-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/.test(v.trim()) ? "secret" : "skip";

const hasSafeKeyName: ValueRule = (k, _v) =>
  [
    /^port$/i, /^host$/i, /^hostname$/i, /^url$/i,
    /^base[_-]?url$/i, /^api[_-]?url$/i, /^app[_-]?url$/i,
    /^domain$/i, /^debug$/i, /^verbose$/i, /^log[_-]?level$/i,
    /^node[_-]?env$/i, /^env$/i, /^environment$/i,
    /^region$/i, /^timezone$/i, /^tz$/i, /^lang$/i, /^locale$/i,
    /^enabled$/i, /^disabled$/i,
    /^app[_-]?name$/i, /^project[_-]?name$/i, /^version$/i,
    /^max/i, /^min/i, /^timeout/i, /^retries$/i,
    /^workers$/i, /^threads$/i, /^pool[_-]?size$/i,
  ].some((p) => p.test(k)) ? "safe" : "skip";

const hasSecretKeyName: ValueRule = (k, _v) =>
  [
    /secret/i, /password/i, /passwd/i, /token/i,
    /api[_-]?key/i, /private[_-]?key/i, /access[_-]?key/i,
    /auth/i, /credential/i,
  ].some((p) => p.test(k)) ? "secret" : "skip";

const isLongRandom: ValueRule = (_k, v) =>
  v.trim().length >= 32 && /^[a-zA-Z0-9\-_./+=]{32,}$/.test(v.trim()) ? "secret" : "skip";

const hasEmbeddedCreds: ValueRule = (_k, v) =>
  /^https?:\/\/[^:]+:[^@]+@/.test(v.trim()) ? "secret" : "skip";

// --- Classification pipeline ---

export const classifyValue = cond([
  // Safe values first (cheap checks)
  isEmpty,
  isTrivialValue,
  isCommonDefault,
  isLocalConnectionString,

  // Known secret formats (gitleaks: 200+ provider patterns)
  matchesGitleaks,
  hasRemoteConnString,
  hasPrivateKeyHeader,

  // Key name heuristics
  hasSafeKeyName,
  hasSecretKeyName,

  // Catch-all heuristics
  isLongRandom,
  hasEmbeddedCreds,
]);

// --- Inline secret scanning ---

export const containsInlineSecret = (text: string): boolean =>
  matchesGitleaksText(text) !== null ||
  /\b(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/.test(text) ||
  /-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/.test(text);

// --- Blocked paths ---

export const isBlockedPath = (path: string) => [
  /\/\.ssh\//, /\/\.aws\//, /\/\.gnupg\//, /\/\.config\/gh\//,
  /id_rsa/, /id_ed25519/, /\.pem$/, /\.key$/,
].some((p) => p.test(path));

// --- Dangerous bash commands ---

const dangerousCommandRules: [RegExp, string][] = [
  [/\becho\s+.*\$[{A-Za-z_]/,                                     "Command could dump environment variables"],
  [/\bprintf\s+.*\$[{A-Za-z_]/,                                   "Command could dump environment variables"],
  [/(?<!\.)(?<!\w)(env|printenv)(?!\w)/,                           "Command could dump environment variables"],
  [/\bset\s*($|\||;|&)/,                                           "Command could dump environment variables"],
  [/\bexport\s+-p\b/,                                              "Command could dump environment variables"],
  [/\bdeclare\s+-x\b/,                                             "Command could dump environment variables"],
  [/\bdocker\s+inspect\b/,                                         "Command could expose container secrets"],
  [/\bcurl\b.*(-H|--header)\s+['"]?(Authorization|X-Api-Key)/i,   "Command contains inline credentials"],
  [/\bnode\b.*process\.env/,                                        "Command could dump environment variables"],
  [/\bpython[3]?\b.*os\.environ/,                                  "Command could dump environment variables"],
];

const stripQuotes = (s: string) => s.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

export function classifyBashCommand(command: string): DangerousCommand {
  if (/\bsecret-env\b/.test(command)) return { dangerous: false, reason: "" };

  if (isBlockedPath(stripQuotes(command)))
    return { dangerous: true, reason: "Command accesses a protected secret file" };

  for (const [pattern, reason] of dangerousCommandRules) {
    if (pattern.test(command)) return { dangerous: true, reason };
  }

  return { dangerous: false, reason: "" };
}
