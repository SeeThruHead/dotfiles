import type { DangerousCommand } from "./types.js";

type Predicate<T extends unknown[]> = (...args: T) => boolean;
type Cond<T extends unknown[], R> = [Predicate<T>, R][];

const cond = <T extends unknown[], R>(rules: Cond<T, R>, fallback: R) =>
  (...args: T): R => {
    for (const [predicate, result] of rules) {
      if (predicate(...args)) return result;
    }
    return fallback;
  };

// --- Predicates: value shape ---

const isEmpty = (_k: string, v: string) => v.trim().length === 0;
const isBoolean = (_k: string, v: string) => /^(true|false|yes|no|on|off|0|1)$/i.test(v.trim());
const isNumber = (_k: string, v: string) => /^\d+$/.test(v.trim());
const isLoopback = (_k: string, v: string) => /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(v.trim());
const isShortSimple = (_k: string, v: string) => v.trim().length < 8 && /^[a-zA-Z0-9._-]+$/.test(v.trim());
const isEnvName = (_k: string, v: string) => /^(development|production|staging|test|debug|info|warn|error)$/i.test(v.trim());

const isCommonDefault = (_k: string, v: string) => [
  "redis", "password", "passwd", "pass", "secret",
  "root", "admin", "test", "guest", "default",
  "changeme", "example", "placeholder",
  "your_secret_here", "your_password_here",
  "xxx", "xxxxxxxx", "todo", "fixme",
].includes(v.trim().toLowerCase());

const isLocalConnectionString = (_k: string, v: string) => {
  const t = v.trim();
  return /^(postgres|mysql|mongodb|redis|amqp|http|https):\/\//.test(t) &&
    /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|host\.docker\.internal)(:|\/|$)/.test(t);
};

// --- Predicates: known secret value prefixes ---

const matchesValue = (pattern: RegExp) => (_k: string, v: string) => pattern.test(v.trim());

const hasOpenAIPrefix =     matchesValue(/^sk-[a-zA-Z0-9\-_]{20,}/);
const hasStripePrefix =     matchesValue(/^sk_(live|test)_[a-zA-Z0-9]{20,}/);
const hasStripePubPrefix =  matchesValue(/^(pk|rk)_live_[a-zA-Z0-9]{20,}/);
const hasAWSKeyId =         matchesValue(/^AKIA[A-Z0-9]{16}$/);
const hasGitHubToken =      matchesValue(/^gh[psoiu]_[a-zA-Z0-9]{36,}/);
const hasGitLabToken =      matchesValue(/^glpat-[a-zA-Z0-9\-_]{20,}/);
const hasSlackToken =       matchesValue(/^xox[bpras]-[a-zA-Z0-9\-]{20,}/);
const hasSendGridKey =      matchesValue(/^SG\.[a-zA-Z0-9\-_]{22,}/);
const hasBearerToken =      matchesValue(/^bearer\s+[a-zA-Z0-9\-_.]{20,}/i);
const hasWebhookSecret =    matchesValue(/^whsec_[a-zA-Z0-9]{20,}/);
const hasJWT =              matchesValue(/^eyJ[a-zA-Z0-9\-_]{20,}/);
const hasRemoteConnString = matchesValue(/^(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/);
const hasPrivateKeyHeader = matchesValue(/^-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/);
const hasLongRandomString = matchesValue(/^[a-zA-Z0-9\-_./+=]{32,}$/);
const hasEmbeddedCreds =    matchesValue(/^https?:\/\/[^:]+:[^@]+@/);

// --- Predicates: key name ---

const matchesKey = (patterns: RegExp[]) => (k: string, _v: string) =>
  patterns.some((p) => p.test(k));

const hasSafeKeyName = matchesKey([
  /^port$/i, /^host$/i, /^hostname$/i, /^url$/i,
  /^base[_-]?url$/i, /^api[_-]?url$/i, /^app[_-]?url$/i,
  /^domain$/i, /^debug$/i, /^verbose$/i, /^log[_-]?level$/i,
  /^node[_-]?env$/i, /^env$/i, /^environment$/i,
  /^region$/i, /^timezone$/i, /^tz$/i, /^lang$/i, /^locale$/i,
  /^enabled$/i, /^disabled$/i,
  /^app[_-]?name$/i, /^project[_-]?name$/i, /^version$/i,
  /^max/i, /^min/i, /^timeout/i, /^retries$/i,
  /^workers$/i, /^threads$/i, /^pool[_-]?size$/i,
]);

const hasSecretKeyName = matchesKey([
  /secret/i, /password/i, /passwd/i, /token/i,
  /api[_-]?key/i, /private[_-]?key/i, /access[_-]?key/i,
  /auth/i, /credential/i,
]);

// --- Classification ---

export const classifyValue = cond<[string, string], "safe" | "secret">([
  [isEmpty,                "safe"],
  [isBoolean,              "safe"],
  [isNumber,               "safe"],
  [isLoopback,             "safe"],
  [isShortSimple,          "safe"],
  [isEnvName,              "safe"],
  [isCommonDefault,        "safe"],
  [isLocalConnectionString,"safe"],

  [hasOpenAIPrefix,        "secret"],
  [hasStripePrefix,        "secret"],
  [hasStripePubPrefix,     "secret"],
  [hasAWSKeyId,            "secret"],
  [hasGitHubToken,         "secret"],
  [hasGitLabToken,         "secret"],
  [hasSlackToken,          "secret"],
  [hasSendGridKey,         "secret"],
  [hasBearerToken,         "secret"],
  [hasWebhookSecret,       "secret"],
  [hasJWT,                 "secret"],
  [hasRemoteConnString,    "secret"],
  [hasPrivateKeyHeader,    "secret"],

  [hasSafeKeyName,         "safe"],
  [hasSecretKeyName,       "secret"],
  [hasLongRandomString,    "secret"],
  [hasEmbeddedCreds,       "secret"],
], "safe");

// --- Inline secret scanning (arbitrary text, not KEY=VALUE) ---

const matchesText = (pattern: RegExp) => (t: string) => pattern.test(t);

export const containsInlineSecret = (text: string) => [
  matchesText(/\bsk-[a-zA-Z0-9\-_]{20,}/),
  matchesText(/\bsk_(live|test)_[a-zA-Z0-9]{20,}/),
  matchesText(/\bAKIA[A-Z0-9]{16}\b/),
  matchesText(/\bgh[psoiu]_[a-zA-Z0-9]{36,}/),
  matchesText(/\bglpat-[a-zA-Z0-9\-_]{20,}/),
  matchesText(/\bxox[bpras]-[a-zA-Z0-9\-]{20,}/),
  matchesText(/\bSG\.[a-zA-Z0-9\-_]{22,}/),
  matchesText(/\bwhsec_[a-zA-Z0-9]{20,}/),
  matchesText(/\beyJ[a-zA-Z0-9\-_]{20,}\./),
  matchesText(/\b(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/),
  matchesText(/-----BEGIN\s+(RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/),
].some((rule) => rule(text));

// --- Blocked paths ---

export const isBlockedPath = (path: string) => [
  matchesText(/\/\.ssh\//),
  matchesText(/\/\.aws\//),
  matchesText(/\/\.gnupg\//),
  matchesText(/\/\.config\/gh\//),
  matchesText(/id_rsa/),
  matchesText(/id_ed25519/),
  matchesText(/\.pem$/),
  matchesText(/\.key$/),
].some((rule) => rule(path));

// --- Dangerous bash commands ---

const stripQuotes = (s: string) => s.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

const dangerousCommands: [Predicate<[string]>, string][] = [
  [(c) => /\becho\s+.*\$[{A-Za-z_]/.test(c),                                     "Command could dump environment variables"],
  [(c) => /\bprintf\s+.*\$[{A-Za-z_]/.test(c),                                   "Command could dump environment variables"],
  [(c) => /(?<!\.)(?<!\w)(env|printenv)(?!\w)/.test(c),                           "Command could dump environment variables"],
  [(c) => /\bset\s*($|\||;|&)/.test(c),                                           "Command could dump environment variables"],
  [(c) => /\bexport\s+-p\b/.test(c),                                              "Command could dump environment variables"],
  [(c) => /\bdeclare\s+-x\b/.test(c),                                             "Command could dump environment variables"],
  [(c) => /\bdocker\s+inspect\b/.test(c),                                         "Command could expose container secrets"],
  [(c) => /\bcurl\b.*(-H|--header)\s+['"]?(Authorization|X-Api-Key)/i.test(c),   "Command contains inline credentials"],
  [(c) => /\bnode\b.*process\.env/.test(c),                                        "Command could dump environment variables"],
  [(c) => /\bpython[3]?\b.*os\.environ/.test(c),                                  "Command could dump environment variables"],
];

export function classifyBashCommand(command: string): DangerousCommand {
  if (/\bsecret-env\b/.test(command)) return { dangerous: false, reason: "" };

  if (isBlockedPath(stripQuotes(command)))
    return { dangerous: true, reason: "Command accesses a protected secret file" };

  for (const [predicate, reason] of dangerousCommands) {
    if (predicate(command)) return { dangerous: true, reason };
  }

  return { dangerous: false, reason: "" };
}
