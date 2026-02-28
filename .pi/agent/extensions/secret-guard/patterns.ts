import type { DangerousCommand } from "./types.js";

const BLOCKED_PATH_PATTERNS = [
  /\/\.ssh\//, /\/\.aws\//, /\/\.gnupg\//, /\/\.config\/gh\//,
  /id_rsa/, /id_ed25519/, /\.pem$/, /\.key$/,
] as const;

const ANCHORED_SECRET_VALUE_PATTERNS = [
  /^sk-[a-zA-Z0-9\-_]{20,}/,
  /^sk_live_[a-zA-Z0-9]{20,}/,
  /^sk_test_[a-zA-Z0-9]{20,}/,
  /^pk_live_[a-zA-Z0-9]{20,}/,
  /^rk_live_[a-zA-Z0-9]{20,}/,
  /^AKIA[A-Z0-9]{16}$/,
  /^ghp_[a-zA-Z0-9]{36,}/,
  /^ghs_[a-zA-Z0-9]{36,}/,
  /^gho_[a-zA-Z0-9]{36,}/,
  /^ghu_[a-zA-Z0-9]{36,}/,
  /^glpat-[a-zA-Z0-9\-_]{20,}/,
  /^xox[bpras]-[a-zA-Z0-9\-]{20,}/,
  /^SG\.[a-zA-Z0-9\-_]{22,}/,
  /^bearer\s+[a-zA-Z0-9\-_.]{20,}/i,
  /^whsec_[a-zA-Z0-9]{20,}/,
  /^eyJ[a-zA-Z0-9\-_]{20,}/,
  /^(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/,
  /^-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /^-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
  /^-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,
] as const;

const INLINE_SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9\-_]{20,}/,
  /\bsk_live_[a-zA-Z0-9]{20,}/,
  /\bsk_test_[a-zA-Z0-9]{20,}/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bghp_[a-zA-Z0-9]{36,}/,
  /\bghs_[a-zA-Z0-9]{36,}/,
  /\bgho_[a-zA-Z0-9]{36,}/,
  /\bghu_[a-zA-Z0-9]{36,}/,
  /\bglpat-[a-zA-Z0-9\-_]{20,}/,
  /\bxox[bpras]-[a-zA-Z0-9\-]{20,}/,
  /\bSG\.[a-zA-Z0-9\-_]{22,}/,
  /\bwhsec_[a-zA-Z0-9]{20,}/,
  /\beyJ[a-zA-Z0-9\-_]{20,}\./,
  /\b(postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/,
  /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/,
  /-----BEGIN\s+EC\s+PRIVATE\s+KEY-----/,
  /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/,
] as const;

const SECRET_KEY_NAME_PATTERNS = [
  /secret/i, /password/i, /passwd/i, /token/i,
  /api[_-]?key/i, /private[_-]?key/i, /access[_-]?key/i,
  /auth/i, /credential/i,
] as const;

const SAFE_KEY_NAME_PATTERNS = [
  /^port$/i, /^host$/i, /^hostname$/i, /^url$/i,
  /^base[_-]?url$/i, /^api[_-]?url$/i, /^app[_-]?url$/i,
  /^domain$/i, /^debug$/i, /^verbose$/i, /^log[_-]?level$/i,
  /^node[_-]?env$/i, /^env$/i, /^environment$/i,
  /^region$/i, /^timezone$/i, /^tz$/i, /^lang$/i, /^locale$/i,
  /^enabled$/i, /^disabled$/i,
  /^app[_-]?name$/i, /^project[_-]?name$/i, /^version$/i,
  /^max/i, /^min/i, /^timeout/i, /^retries$/i,
  /^workers$/i, /^threads$/i, /^pool[_-]?size$/i,
] as const;

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
] as const;

const someMatch = (patterns: readonly RegExp[], text: string) =>
  patterns.some((p) => p.test(text));

export const isBlockedPath = (path: string) => someMatch(BLOCKED_PATH_PATTERNS, path);
export const matchesAnchoredSecretPattern = (value: string) => someMatch(ANCHORED_SECRET_VALUE_PATTERNS, value);
export const containsInlineSecretPattern = (text: string) => someMatch(INLINE_SECRET_PATTERNS, text);
export const hasSecretKeyName = (key: string) => someMatch(SECRET_KEY_NAME_PATTERNS, key);
export const hasSafeKeyName = (key: string) => someMatch(SAFE_KEY_NAME_PATTERNS, key);
export const isEnvDumpCommand = (command: string) => someMatch(ENV_DUMP_PATTERNS, command);

export const isSecretEnvCli = (command: string) => /\bsecret-env\b/.test(command);

export const isSafeValue = (value: string): boolean => {
  const v = value.trim();
  return (
    /^(true|false|yes|no|on|off|0|1)$/i.test(v) ||
    /^\d+$/.test(v) ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(v) ||
    (v.length < 8 && /^[a-zA-Z0-9._-]+$/.test(v)) ||
    /^(development|production|staging|test|debug|info|warn|error)$/i.test(v)
  );
};

export const isLongRandomString = (value: string) =>
  value.length >= 32 && /^[a-zA-Z0-9\-_./+=]{32,}$/.test(value);

export const hasEmbeddedCredentials = (value: string) =>
  /^https?:\/\/[^:]+:[^@]+@/.test(value);

export const stripQuotedStrings = (command: string) =>
  command.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");

export function classifyBashCommand(command: string): DangerousCommand {
  if (isSecretEnvCli(command)) return { dangerous: false, reason: "" };

  const unquoted = stripQuotedStrings(command);

  if (isBlockedPath(unquoted))
    return { dangerous: true, reason: "Command accesses a protected secret file" };

  if (isEnvDumpCommand(command))
    return { dangerous: true, reason: "Command could dump all environment variables" };

  return { dangerous: false, reason: "" };
}
