import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { redactText } from "../redaction.js";
import { matchesGitleaksValue, matchesGitleaksText } from "../gitleaks.js";
import { classifyValue } from "../patterns.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e: any) {
    failed++;
    const msg = `  ❌ ${name}: ${e.message}`;
    console.log(msg);
    failures.push(msg);
  }
}

// ================================================================
// 1. Test matchesGitleaksValue directly against known token formats
// ================================================================

console.log("\n🔬 Gitleaks Value Detection (matchesGitleaksValue)");

const VALUE_TESTS: [string, string, boolean][] = [
  // [description, value, shouldMatch]

  // AWS
  ["AWS Access Key ID", "AKIAIOSFODNN7EXAMPLE", true],
  ["AWS ASIA key", "ASIAXXXXXXXXXEXAMPLE", true],

  // GCP — AIza + 35 word chars
  ["GCP API Key", "AIzaSyA1234567890abcdefghijklmnopqrstuv", true],

  // GitHub
  ["GitHub PAT (ghp_)", "ghp_0123456789abcdefABCDEF0123456789abcd", true],
  ["GitHub Fine-Grained PAT", "github_pat_11AAAAAA0000000000000000000000000000000000000000000000000000000000000000000000000000000000", true],
  ["GitHub OAuth (gho_)", "gho_0123456789abcdefABCDEF0123456789abcd", true],
  ["GitHub App Token (ghu_)", "ghu_0123456789abcdefABCDEF0123456789abcd", true],
  ["GitHub Refresh Token (ghr_)", "ghr_0123456789abcdefABCDEF0123456789abcd", true],

  // GitLab
  ["GitLab PAT (glpat-)", "glpat-abcdefghij0123456789", true],

  // Slack
  ["Slack Bot Token (xoxb-)", "xoxb-0000000000-0000000000000-TESTFAKETESTFAKETESTFAKE", true],
  // Slack App — xapp-\d-[A-Z0-9]+-\d+-[a-z0-9]+
  ["Slack App Token (xapp-)", "xapp-0-AAAAAAAAAA-0000000000000-testfaketestfaketest", true],
  ["Slack User Token (xoxp-)", "xoxp-0000000000-0000000000000-0000000000000-testfaketestfaketestfaketestfake", true],

  // Stripe
  ["Stripe Secret Key", "sk_test_abcdefghijklmnopqrstuvwxyz", true],
  ["Stripe Test Key", "sk_test_abcdefghijklmnopqrstuvwxyz", true],
  ["Stripe Restricted Key", "rk_test_abcdefghijklmnopqrstuvwxyz", true],

  // npm
  // npm — npm_ + exactly 36 lowercase alphanum
  ["npm Access Token", "npm_abcdefghijklmnopqrstuvwxyz0123456789", true],  // already 36 chars, but must be lowercase

  // DigitalOcean
  ["DigitalOcean PAT", "dop_v1_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", true],

  // Grafana
  ["Grafana Cloud Token", "glc_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh", true],

  // SendGrid
  ["SendGrid API Key", "SG.abcdefghijklmnop_qrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab", true],

  // Twilio
  ["Twilio API Key", "SK0123456789abcdef0123456789abcdef", true],

  // 1Password
  ["1Password Secret Key", "A3-ABCDEF-ABCDEFGHIJK-ABCDE-ABCDE-ABCDE", true],

  // Age
  // Age — bech32 charset [QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L] × 58
  ["Age Secret Key", "AGE-SECRET-KEY-1QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7LQPZRY9X8GF2TVDW0S3JN54KHCE6M", true],

  // Anthropic
  // Anthropic — sk-ant-api03- + exactly 93 alphanum/dash/underscore + AA
  ["Anthropic API Key", "sk-ant-api03-" + "a".repeat(93) + "AA", true],

  // Safe values — should NOT match
  ["Short safe string", "hello", false],
  ["Port number", "3000", false],
  ["Boolean", "true", false],
  ["Hostname", "localhost", false],
  ["Normal URL", "https://example.com/api/v1", false],
  ["App name", "my-cool-app", false],
  ["Semver", "1.2.3", false],
];

for (const [desc, value, shouldMatch] of VALUE_TESTS) {
  assert(`${desc} → ${shouldMatch ? "detected" : "safe"}`, () => {
    const result = matchesGitleaksValue(value);
    if (shouldMatch && result === null) {
      throw new Error(`Expected gitleaks match but got null for: ${value}`);
    }
    if (!shouldMatch && result !== null) {
      throw new Error(`Expected no match but got "${result}" for: ${value}`);
    }
  });
}

// ================================================================
// 2. Test matchesGitleaksText for inline detection
// ================================================================

console.log("\n🔬 Gitleaks Text Detection (matchesGitleaksText)");

const TEXT_TESTS: [string, string, boolean][] = [
  ["GitHub token in prose", 'The token is ghp_0123456789abcdefABCDEF0123456789abcd okay?', true],
  ["AWS key in log output", "AccessKeyId: AKIAIOSFODNN7EXAMPLE", true],
  ["Slack webhook URL", "webhook: https://hooks.slack.com/services/TFAKE0000/BFAKE0000/TESTFAKETESTFAKETESTFAKE", true],
  ["JWT in header", 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5.eyJzdWIiOiIxMjM0NTY3ODkwIiw.SflKxwRJSMeKKF2QT4fwpM', true],
  // PEM — gitleaks needs 64+ chars between markers
  ["PEM private key block", "-----BEGIN RSA PRIVATE KEY-----\n" + "A".repeat(64) + "\n-----END RSA PRIVATE KEY-----", true],
  ["Normal prose", "The server runs on port 3000 at localhost", false],
  ["Code snippet", "const x = 42; console.log('hello');", false],
  ["Normal URL", "Visit https://docs.example.com for more info", false],
];

for (const [desc, text, shouldMatch] of TEXT_TESTS) {
  assert(`${desc} → ${shouldMatch ? "detected" : "safe"}`, () => {
    const result = matchesGitleaksText(text);
    if (shouldMatch && result === null) {
      throw new Error(`Expected gitleaks match but got null`);
    }
    if (!shouldMatch && result !== null) {
      throw new Error(`Expected no match but got "${result}"`);
    }
  });
}

// ================================================================
// 3. Test classifyValue for env-line classification
// ================================================================

console.log("\n🔬 classifyValue (env KEY=VALUE classification)");

const CLASSIFY_TESTS: [string, string, string, "safe" | "secret"][] = [
  // [desc, key, value, expected]

  // Gitleaks-detected secrets
  ["GitHub PAT via gitleaks", "GITHUB_TOKEN", "ghp_0123456789abcdefABCDEF0123456789abcd", "secret"],
  ["AWS key via gitleaks", "AWS_ACCESS_KEY_ID", "AKIAIOSFODNN7EXAMPLE", "secret"],
  ["Stripe via gitleaks", "STRIPE_KEY", "sk_test_abcdefghijklmnopqrstuvwxyz", "secret"],

  // Secret key name heuristic
  ["Secret by key name (password)", "DB_PASSWORD", "mySuperSecretDBPass", "secret"],
  ["Secret by key name (token)", "AUTH_TOKEN", "some-long-opaque-value-here-abcdef", "secret"],
  ["Secret by key name (api_key)", "MY_API_KEY", "not-a-gitleaks-match-but-secret-name", "secret"],
  ["Secret by key name (secret)", "APP_SECRET", "anotherlongishvaluethatisntobvious", "secret"],
  ["Secret by key name (credential)", "DB_CREDENTIAL", "abcdefghijklmnop", "secret"],
  ["Secret by key name (access_key)", "SERVICE_ACCESS_KEY", "xyzxyzxyzxyzxyzxyz", "secret"],
  ["Secret by key name (private_key)", "MY_PRIVATE_KEY", "someprivatekeydata12345678", "secret"],

  // Remote connection strings
  ["Remote postgres URL", "DATABASE_URL", "postgres://admin:s3cret@db.prod.example.com:5432/mydb", "secret"],
  ["Remote mysql URL", "MYSQL_URL", "mysql://root:pass123@mysql.prod.internal:3306/app", "secret"],
  ["HTTP embedded creds", "WEBHOOK_URL", "https://admin:secret@api.example.com/hook", "secret"],

  // Long random strings
  ["Long random value", "SOME_VAR", "aB3dEfGhIjKlMnOpQrStUvWxYz0123456789abcd", "secret"],

  // Safe values
  ["Port", "PORT", "3000", "safe"],
  ["Host", "HOST", "localhost", "safe"],
  ["Boolean", "DEBUG", "true", "safe"],
  ["Environment", "NODE_ENV", "production", "safe"],
  ["App name", "APP_NAME", "my-cool-app", "safe"],
  ["Timeout", "TIMEOUT", "30000", "safe"],
  ["Log level", "LOG_LEVEL", "info", "safe"],
  ["Region", "REGION", "us-east-1", "safe"],
  ["Version", "VERSION", "1.2.3", "safe"],
  ["Empty", "SECRET_KEY", "", "safe"],
  ["Common default (changeme)", "PASSWORD", "changeme", "safe"],
  ["Common default (placeholder)", "TOKEN", "placeholder", "safe"],
  ["Local postgres", "DATABASE_URL", "postgres://user:pass@localhost:5432/dev", "safe"],
  ["Local redis", "REDIS_URL", "redis://default:pass@127.0.0.1:6379/0", "safe"],
  ["Safe URL", "API_URL", "https://api.example.com/v1", "safe"],
  ["Workers count", "WORKERS", "4", "safe"],
  ["Pool size", "POOL_SIZE", "10", "safe"],
  ["Short safe string", "MY_VAR", "hello", "safe"],
];

for (const [desc, key, value, expected] of CLASSIFY_TESTS) {
  assert(`${desc} → ${expected}`, () => {
    const result = classifyValue(key, value);
    if (result !== expected) {
      throw new Error(`classifyValue("${key}", "${value.slice(0, 40)}...") = "${result}", expected "${expected}"`);
    }
  });
}

// ================================================================
// 4. Test full redactText on the comprehensive fixture
// ================================================================

console.log("\n🔬 Full redactText on comprehensive gitleaks fixture");

assert("Comprehensive fixture — all tokens redacted, comments preserved", () => {
  const input = readFileSync(join(__dirname, "fixtures", "gitleaks-comprehensive.txt"), "utf-8");
  const result = redactText(input);

  if (!result.redacted) {
    throw new Error("Expected redacted=true");
  }

  // Should never contain the blocked message
  if (result.text.includes("🔒 Blocked:")) {
    throw new Error("Output was blocked instead of redacted!");
  }

  // All comments should be preserved
  const comments = [
    "# --- Cloud Providers ---",
    "# AWS Access Key",
    "# GCP API Key",
    "# --- AI/ML ---",
    "# Anthropic",
    "# --- Version Control ---",
    "# GitHub PAT",
    "# GitLab PAT",
    "# --- Communication ---",
    "# Slack Bot Token",
    "# --- Payment ---",
    "# Stripe Secret Key",
    "# --- CI/CD & Hosting ---",
    "# --- Monitoring ---",
    "# --- Auth ---",
    "# --- Other ---",
    "# --- Generic patterns ---",
    "# --- Private Keys (inline) ---",
  ];
  for (const c of comments) {
    if (!result.text.includes(c)) {
      throw new Error(`Missing comment: "${c}"`);
    }
  }

  // No raw token values should appear in output
  const mustNotContain = [
    "AKIAIOSFODNN7EXAMPLE",
    "AIzaSyA1234567890",
    "sk-ant-api03-",
    "ghp_0123456789",
    "github_pat_11AAAAAA",
    "gho_0123456789",
    "glpat-abcdefghij",
    "xoxb-00000",
    "xapp-0-AAAA",
    "sk_test_abcdef",
    "rk_test_abcdef",
    "npm_abcdefghij",
    "dop_v1_abcdef",
    "glc_ABCDEFGHIJ",
    "SG.abcdefghij",
    "SK0123456789abcdef",
    "A3-ABCDEF-ABCDEFGHIJK",
    "AGE-SECRET-KEY-1",
    "MIIEpAIBAAK",
    "eyJhbGciOiJIUzI1NiIsInR5",
    "hooks.slack.com/services",
  ];
  for (const v of mustNotContain) {
    if (result.text.includes(v)) {
      throw new Error(`Token value leaked: "${v}"\nContext: ${result.text.substring(result.text.indexOf(v) - 40, result.text.indexOf(v) + 60)}`);
    }
  }

  // PEM markers should be preserved
  if (!result.text.includes("-----BEGIN RSA PRIVATE KEY-----")) {
    throw new Error("PEM BEGIN marker missing");
  }
  if (!result.text.includes("-----END RSA PRIVATE KEY-----")) {
    throw new Error("PEM END marker missing");
  }
});

// ================================================================
// 5. Test env-line redaction for each gitleaks token format
// ================================================================

console.log("\n🔬 Individual env-line redaction per token type");

const ENV_LINE_TESTS: [string, string][] = [
  ["AWS", "AWS_KEY=AKIAIOSFODNN7EXAMPLE"],
  ["GCP", "GCP_KEY=AIzaSyA1234567890abcdefghijklmnopqrst"],
  ["Anthropic", "KEY=sk-ant-api03-" + "a".repeat(93) + "AA"],
  ["GitHub PAT", "TOKEN=ghp_0123456789abcdefABCDEF0123456789abcd"],
  ["GitHub Fine-Grained", "TOKEN=github_pat_11AAAAAA0000000000000000000000000000000000000000000000000000000000000000000000000000000000"],
  ["GitHub OAuth", "TOKEN=gho_0123456789abcdefABCDEF0123456789abcd"],
  ["GitLab PAT", "TOKEN=glpat-abcdefghij0123456789"],
  ["Slack Bot", "TOKEN=xoxb-0000000000-0000000000000-TESTFAKETESTFAKETESTFAKE"],
  ["Stripe Secret", "KEY=sk_test_abcdefghijklmnopqrstuvwxyz"],
  ["Stripe Test", "KEY=sk_test_abcdefghijklmnopqrstuvwxyz"],
  ["npm", "TOKEN=npm_abcdefghijklmnopqrstuvwxyz0123456789"],
  ["DigitalOcean", "TOKEN=dop_v1_abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"],
  ["Grafana Cloud", "TOKEN=glc_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefgh"],
  ["SendGrid", "KEY=SG.abcdefghijklmnop_qrstuvwxyz.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ab"],
  ["Twilio", "KEY=SK0123456789abcdef0123456789abcdef"],
  ["1Password", "KEY=A3-ABCDEF-ABCDEFGHIJK-ABCDE-ABCDE-ABCDE"],
  ["Age", "KEY=AGE-SECRET-KEY-1QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7LQPZRY9X8GF2TVDW0S3JN54KHCE6M"],
  ["Mailchimp", "MAILCHIMP_KEY=abcdef0123456789abcdef0123456789-us20"],
];

for (const [desc, line] of ENV_LINE_TESTS) {
  assert(`${desc} env line redacted`, () => {
    const result = redactText(line);
    if (!result.redacted) {
      throw new Error(`Not redacted: ${line}`);
    }
    if (!result.text.includes("<REDACTED>")) {
      throw new Error(`Missing <REDACTED> in output: ${result.text}`);
    }
    // The raw value after = should not appear
    const rawValue = line.split("=").slice(1).join("=");
    if (result.text.includes(rawValue)) {
      throw new Error(`Raw value leaked: ${rawValue}`);
    }
  });
}

// ================================================================
// 6. Test inline (non-env) gitleaks detection + redaction
// ================================================================

console.log("\n🔬 Inline gitleaks redaction (tokens in prose)");

const INLINE_TESTS: [string, string, string][] = [
  ["GitHub token in sentence", "Deploy with token ghp_0123456789abcdefABCDEF0123456789abcd now", "ghp_0123456789"],
  ["AWS key in log", "Found key AKIAIOSFODNN7EXAMPLE in config", "AKIAIOSFODNN7EXAMPLE"],
  ["Slack webhook in docs", "Post to https://hooks.slack.com/services/TFAKE0000/BFAKE0000/TESTFAKETESTFAKETESTFAKE", "hooks.slack.com/services"],
  ["JWT in debug output", 'token: eyJhbGciOiJIUzI1NiIsInR5.eyJzdWIiOiIxMjM0NTY3ODkwIiw.SflKxwRJSMeKKF2QT4fwpM', "eyJhbGciOiJIUzI1NiIsInR5"],
  ["PEM in YAML", "key: |\n  -----BEGIN RSA PRIVATE KEY-----\n  MIIEpAIBAAKCAQEA0Z3\n  -----END RSA PRIVATE KEY-----", "MIIEpAIBAAK"],
];

for (const [desc, input, mustNotContain] of INLINE_TESTS) {
  assert(`${desc}`, () => {
    const result = redactText(input);
    if (!result.redacted) {
      throw new Error(`Not redacted. Output: ${result.text}`);
    }
    if (result.text.includes("🔒 Blocked:")) {
      throw new Error("Was blocked instead of redacted!");
    }
    if (result.text.includes(mustNotContain)) {
      throw new Error(`Leaked "${mustNotContain}" in: ${result.text}`);
    }
  });
}

// ================================================================
// Summary
// ================================================================

console.log(`\n${"=".repeat(50)}`);
if (failed > 0) {
  console.log(`❌ ${failed} FAILED, ${passed} passed\n`);
  for (const f of failures) console.log(f);
  console.log();
  process.exit(1);
} else {
  console.log(`✅ All ${passed} tests passed\n`);
  process.exit(0);
}
