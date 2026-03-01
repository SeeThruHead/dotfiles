import { matchesGitleaksValue, matchesGitleaksText } from "./gitleaks.js";

// ================================================================
//  Value classification pipeline — optimized
// ================================================================
//
//  Key optimizations vs original:
//  - Value is trimmed ONCE and passed through, not re-trimmed per rule
//  - Key name checks use a single pre-compiled regex instead of .some()
//  - Trivial values and common defaults use Set lookup instead of regex
//  - Connection string checks combined into fewer regex tests
// ================================================================

type Verdict = "safe" | "secret" | "skip";

// --- Pre-compiled patterns (built once at module load) ---

const TRIVIAL_EXACT = new Set([
  "true", "false", "yes", "no", "on", "off", "0", "1",
  "localhost", "127.0.0.1", "0.0.0.0", "::1",
  "development", "production", "staging", "test",
  "debug", "info", "warn", "error",
]);

const COMMON_DEFAULTS = new Set([
  "redis", "password", "passwd", "pass", "secret",
  "root", "admin", "test", "guest", "default",
  "changeme", "example", "placeholder",
  "your_secret_here", "your_password_here",
  "xxx", "xxxxxxxx", "todo", "fixme",
]);

// Single regex for safe key names (combined with |)
const SAFE_KEY_RE = /^(?:port|host|hostname|url|base[_-]?url|api[_-]?url|app[_-]?url|domain|debug|verbose|log[_-]?level|node[_-]?env|env|environment|region|timezone|tz|lang|locale|enabled|disabled|app[_-]?name|project[_-]?name|version|max.*|min.*|timeout.*|retries|workers|threads|pool[_-]?size)$/i;

// Single regex for secret key names
const SECRET_KEY_RE = /(?:secret|password|passwd|token|api[_-]?key|private[_-]?key|access[_-]?key|auth|credential)/i;

// Connection string protocol prefix
const CONN_PROTO_RE = /^(?:postgres|mysql|mongodb|redis|amqp|https?):\/\//;
const LOCAL_HOST_RE = /(?:@|\/\/)(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1|host\.docker\.internal)(?:[:\/]|$)/;
const REMOTE_CONN_RE = /^(?:postgres|mysql|mongodb|redis|amqp):\/\/[^:]+:[^@]+@/;
const EMBEDDED_CREDS_RE = /^https?:\/\/[^:]+:[^@]+@/;
const PEM_HEADER_RE = /^-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----/;
const LONG_RANDOM_RE = /^[a-zA-Z0-9\-_./+=]{32,}$/;
const SHORT_SAFE_RE = /^[a-zA-Z0-9._-]+$/;
const DIGITS_RE = /^\d+$/;

/**
 * Classify a KEY=VALUE pair as safe or secret.
 * First-match-wins pipeline. Value should NOT be pre-trimmed — we trim once here.
 */
export function classifyValue(key: string, rawValue: string): "safe" | "secret" {
  const v = rawValue.trim();

  // Empty → safe
  if (v.length === 0) return "safe";

  // Trivial values (booleans, digits, well-known strings)
  const vLower = v.toLowerCase();
  if (TRIVIAL_EXACT.has(vLower)) return "safe";
  if (DIGITS_RE.test(v)) return "safe";
  if (v.length < 8 && SHORT_SAFE_RE.test(v)) return "safe";

  // Common development defaults
  if (COMMON_DEFAULTS.has(vLower)) return "safe";

  // Local connection strings → safe
  if (CONN_PROTO_RE.test(v) && LOCAL_HOST_RE.test(v)) return "safe";

  // Gitleaks pattern match → secret
  if (matchesGitleaksValue(v) !== null) return "secret";

  // Remote connection strings with credentials → secret
  if (REMOTE_CONN_RE.test(v)) return "secret";

  // PEM private key header → secret
  if (PEM_HEADER_RE.test(v)) return "secret";

  // Embedded HTTP credentials → secret (before safe key name check)
  if (EMBEDDED_CREDS_RE.test(v)) return "secret";

  // Safe key name heuristic
  if (SAFE_KEY_RE.test(key)) return "safe";

  // Secret key name heuristic
  if (SECRET_KEY_RE.test(key)) return "secret";

  // Long random-looking string → secret
  if (v.length >= 32 && LONG_RANDOM_RE.test(v)) return "secret";

  return "safe";
}

// ================================================================
//  Inline secret scanning
// ================================================================

// ================================================================
//  Inline secret redaction
// ================================================================
//
//  Instead of blocking entire output, redact secrets in-place.
//  Returns the redacted text and whether any redaction occurred.
// ================================================================

const REDACTED = "<REDACTED>";

// PEM block: redact everything between BEGIN and END markers
const PEM_BLOCK_RE = /(-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----)([\s\S]*?)(-----END\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----)/g;

// Connection strings with embedded credentials
const INLINE_CONN_REDACT_RE = /\b((?:postgres|mysql|mongodb|redis|amqp):\/\/)([^:]+):([^@]+)@/g;

// HTTP URLs with embedded credentials
const INLINE_HTTP_CREDS_RE = /\b(https?:\/\/)([^:]+):([^@]+)@/g;

export function redactInlineSecrets(text: string): { text: string; redacted: boolean } {
  let result = text;
  let redacted = false;

  // Redact PEM private key blocks (keep markers, redact body)
  result = result.replace(PEM_BLOCK_RE, (_match, begin, _body, end) => {
    redacted = true;
    return `${begin}\n${REDACTED}\n${end}`;
  });

  // Redact credentials in connection strings
  result = result.replace(INLINE_CONN_REDACT_RE, (_match, proto, user) => {
    redacted = true;
    return `${proto}${user}:${REDACTED}@`;
  });

  // Redact credentials in HTTP URLs
  result = result.replace(INLINE_HTTP_CREDS_RE, (_match, proto, user) => {
    redacted = true;
    return `${proto}${user}:${REDACTED}@`;
  });

  // Redact gitleaks matches
  if (matchesGitleaksText(result) !== null) {
    // For gitleaks matches, we need to run each rule's pattern and redact matches
    result = redactGitleaksMatches(result);
    if (result !== text) redacted = true;
  }

  return { text: result, redacted };
}

function redactGitleaksMatches(text: string): string {
  // Import would be circular, so we use the already-imported function
  // For gitleaks, we check the full text and redact capture groups
  // Since gitleaks patterns use capture groups for the secret part,
  // we need access to the raw patterns. For now, do a line-by-line approach:
  // lines that look like they contain high-entropy tokens get redacted.
  const lines = text.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    if (matchesGitleaksText(line) !== null) {
      // Redact the line but keep any key/label prefix
      const colonIdx = line.indexOf(":");
      const eqIdx = line.indexOf("=");
      const sepIdx = colonIdx >= 0 && eqIdx >= 0
        ? Math.min(colonIdx, eqIdx)
        : colonIdx >= 0 ? colonIdx : eqIdx;

      if (sepIdx >= 0 && sepIdx < 40) {
        result.push(line.substring(0, sepIdx + 1) + " " + REDACTED);
      } else {
        result.push(REDACTED);
      }
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}


