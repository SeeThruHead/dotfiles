import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { redactText } from "../redaction.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fix = (name: string) =>
  readFileSync(join(__dirname, "fixtures", name), "utf-8");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(
  name: string,
  fn: () => void
) {
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

function expect(actual: string) {
  return {
    toContain(sub: string) {
      if (!actual.includes(sub))
        throw new Error(`Expected output to contain "${sub}"\n    Got: ${actual.slice(0, 200)}`);
    },
    notToContain(sub: string) {
      if (actual.includes(sub))
        throw new Error(`Expected output NOT to contain "${sub}"\n    Got: ${actual.slice(0, 200)}`);
    },
    toBe(expected: string) {
      if (actual !== expected)
        throw new Error(`Expected:\n${expected.slice(0, 200)}\n    Got:\n${actual.slice(0, 200)}`);
    },
    toEqual(expected: string) {
      if (actual.trim() !== expected.trim())
        throw new Error(`Expected:\n${expected.slice(0, 300)}\n    Got:\n${actual.slice(0, 300)}`);
    },
  };
}

function expectRedacted(result: { text: string; redacted: boolean }) {
  if (!result.redacted)
    throw new Error("Expected redacted=true but got false");
  return expect(result.text);
}

function expectNotRedacted(result: { text: string; redacted: boolean }) {
  if (result.redacted)
    throw new Error(`Expected redacted=false but got true.\n    Text: ${result.text.slice(0, 200)}`);
  return expect(result.text);
}

const BLOCKED = "🔒 Blocked:";
const R = "<REDACTED>";

// ================================================================
console.log("\n🔑 PEM Key Tests");
// ================================================================

assert("RSA private key — not blocked, body redacted", () => {
  const result = redactText(fix("pem-rsa.txt"));
  expectRedacted(result).notToContain(BLOCKED);
  expectRedacted(result).toContain("-----BEGIN RSA PRIVATE KEY-----");
  expectRedacted(result).toContain("-----END RSA PRIVATE KEY-----");
  expectRedacted(result).toContain(R);
  expectRedacted(result).notToContain("MIIEpAIBAAK");
});

assert("EC private key — not blocked, body redacted", () => {
  const result = redactText(fix("pem-ec.txt"));
  expectRedacted(result).notToContain(BLOCKED);
  expectRedacted(result).toContain("-----BEGIN EC PRIVATE KEY-----");
  expectRedacted(result).toContain("-----END EC PRIVATE KEY-----");
  expectRedacted(result).toContain(R);
  expectRedacted(result).notToContain("MHQCAQEEIODq");
});

assert("OPENSSH private key — not blocked, body redacted", () => {
  const result = redactText(fix("pem-openssh.txt"));
  expectRedacted(result).notToContain(BLOCKED);
  expectRedacted(result).toContain("-----BEGIN OPENSSH PRIVATE KEY-----");
  expectRedacted(result).toContain("-----END OPENSSH PRIVATE KEY-----");
  expectRedacted(result).toContain(R);
  expectRedacted(result).notToContain("b3BlbnNzaC1r");
});

assert("PEM embedded in YAML config — redacts key, keeps config", () => {
  const result = redactText(fix("pem-in-config.txt"));
  expectRedacted(result).notToContain(BLOCKED);
  expectRedacted(result).toContain("host: 0.0.0.0");
  expectRedacted(result).toContain("port: 443");
  expectRedacted(result).toContain("level: info");
  expectRedacted(result).toContain("-----BEGIN RSA PRIVATE KEY-----");
  expectRedacted(result).toContain(R);
  expectRedacted(result).notToContain("MIIEpAIBAAK");
});

// ================================================================
console.log("\n📋 Env File Tests");
// ================================================================

assert("Basic env — redacts secrets, keeps safe values", () => {
  const result = redactText(fix("env-basic.txt"));
  expectRedacted(result).toContain("PORT=3000");
  expectRedacted(result).toContain("HOST=localhost");
  expectRedacted(result).toContain("DEBUG=true");
  expectRedacted(result).toContain("NODE_ENV=development");
  expectRedacted(result).toContain("APP_NAME=my-cool-app");
  expectRedacted(result).toContain("TIMEOUT=30000");
  expectRedacted(result).toContain("PASSWORD=changeme"); // common default
  expectRedacted(result).toContain("EMPTY_VAR=");
  expectRedacted(result).toContain(`API_KEY=${R}`);
  expectRedacted(result).toContain(`DATABASE_URL=${R}`);
  expectRedacted(result).notToContain("sk-1234567890");
  expectRedacted(result).notToContain("supersecretpassword");
});

assert("Quoted env values — redacts secrets, preserves quotes", () => {
  const result = redactText(fix("env-quoted.txt"));
  expectRedacted(result).toContain(`SECRET_KEY="${R}"`);
  expectRedacted(result).toContain(`TOKEN="${R}"`);
  expectRedacted(result).toContain(`SAFE_PORT="3000"`);
  expectRedacted(result).toContain(`APP_NAME='hello-world'`);
  expectRedacted(result).notToContain("sk-proj-");
  expectRedacted(result).notToContain("ghp_ABCDEF");
});

assert("Export prefix env — redacts secrets, keeps export keyword", () => {
  const result = redactText(fix("env-export.txt"));
  expectRedacted(result).toContain("export PORT=8080");
  expectRedacted(result).toContain("export NODE_ENV=production");
  expectRedacted(result).toContain("export DEBUG=false");
  expectRedacted(result).toContain(`export API_KEY=${R}`);
  expectRedacted(result).toContain(`export DATABASE_URL=${R}`);
  expectRedacted(result).notToContain("sk-1234567890");
  expectRedacted(result).notToContain("hunter2");
});

assert("All-safe env — nothing redacted", () => {
  const result = redactText(fix("safe-config.txt"));
  expectNotRedacted(result);
});

// ================================================================
console.log("\n🔗 Connection String Tests");
// ================================================================

assert("Inline connection strings — redacts remote passwords, keeps local", () => {
  const result = redactText(fix("conn-strings.txt"));
  expectRedacted(result).notToContain(BLOCKED);
  // Remote passwords redacted
  expectRedacted(result).notToContain("s3cretP@ss");
  expectRedacted(result).notToContain("p@ssw0rd123");
  expectRedacted(result).notToContain("MonG0S3cr3t");
  expectRedacted(result).notToContain("r3d1sP@ss");
  expectRedacted(result).notToContain("bunnysecret");
  expectRedacted(result).notToContain("secretpass123");
  expectRedacted(result).notToContain("tok3n");
  // Protocol and user preserved
  expectRedacted(result).toContain("postgres://admin:");
  expectRedacted(result).toContain("mysql://root:");
  // Comments preserved
  expectRedacted(result).toContain("# Remote connection strings");
  expectRedacted(result).toContain("# Local connection strings");
});

// ================================================================
console.log("\n🔍 Gitleaks Pattern Tests");
// ================================================================

assert("GitHub/Slack/Stripe tokens — redacted via env key=value", () => {
  const result = redactText(fix("gitleaks-tokens.txt"));
  expectRedacted(result).notToContain("ghp_ABCDEF");
  expectRedacted(result).notToContain("github_pat_");
  expectRedacted(result).notToContain("xoxb-");
  expectRedacted(result).notToContain("sk_test_");
  // Comments preserved
  expectRedacted(result).toContain("# GitHub tokens");
  expectRedacted(result).toContain("# Slack");
});

assert("AWS credentials file — redacts secret keys", () => {
  const result = redactText(fix("aws-creds.txt"));
  expectRedacted(result).notToContain("wJalrXUtnFEMI");
  expectRedacted(result).notToContain("je7MtGbClwBF");
  // Section headers preserved
  expectRedacted(result).toContain("[default]");
  expectRedacted(result).toContain("[production]");
  expectRedacted(result).toContain("region=us-west-2");
});

// ================================================================
console.log("\n📝 Plain Text / Prose Tests");
// ================================================================

assert("No secrets at all — passes through unchanged", () => {
  const result = redactText(fix("no-secrets.txt"));
  expectNotRedacted(result);
  expect(result.text).toBe(fix("no-secrets.txt"));
});

assert("Prose with embedded connection string — redacts password inline", () => {
  const result = redactText(fix("mixed-prose.txt"));
  expectRedacted(result).notToContain(BLOCKED);
  expectRedacted(result).notToContain("hunter2secret");
  expectRedacted(result).toContain("postgres://admin:");
  expectRedacted(result).toContain("Here's how to configure the app:");
  expectRedacted(result).toContain("https://docs.example.com/setup");
});

// ================================================================
console.log("\n🧩 Multiline Mixed Content Tests");
// ================================================================

assert("Mixed env + PEM + prose — redacts all secrets, preserves structure", () => {
  const result = redactText(fix("multiline-mixed.txt"));
  expectRedacted(result).notToContain(BLOCKED);
  // PEM body redacted
  expectRedacted(result).notToContain("b3BlbnNzaC1r");
  expectRedacted(result).toContain("-----BEGIN OPENSSH PRIVATE KEY-----");
  expectRedacted(result).toContain("-----END OPENSSH PRIVATE KEY-----");
  // Remote DB password redacted
  expectRedacted(result).notToContain("Pr0dP@ssw0rd!");
  expectRedacted(result).notToContain("r3d1sS3cr3t");
  // Prose preserved
  expectRedacted(result).toContain("## Deployment Notes");
  expectRedacted(result).toContain("Remember to rotate keys quarterly.");
});

// ================================================================
console.log("\n🧪 Edge Case Tests");
// ================================================================

assert("Empty string — not redacted", () => {
  const result = redactText("");
  expectNotRedacted(result);
  expect(result.text).toBe("");
});

assert("Single newline — not redacted", () => {
  const result = redactText("\n");
  expectNotRedacted(result);
});

assert("Just a comment — not redacted", () => {
  const result = redactText("# This is a comment\n# Another comment");
  expectNotRedacted(result);
});

assert("Key with empty value — safe", () => {
  const result = redactText("SECRET_KEY=");
  expectNotRedacted(result);
});

assert("Key with trivial value — safe", () => {
  const result = redactText("PASSWORD=changeme");
  expectNotRedacted(result);
});

assert("Never outputs blocked message", () => {
  // Run all fixtures and make sure none produce the blocked message
  const fixtures = [
    "pem-rsa.txt", "pem-ec.txt", "pem-openssh.txt", "pem-in-config.txt",
    "env-basic.txt", "env-quoted.txt", "env-export.txt", "safe-config.txt",
    "conn-strings.txt", "gitleaks-tokens.txt", "aws-creds.txt",
    "mixed-prose.txt", "no-secrets.txt", "multiline-mixed.txt",
  ];
  for (const f of fixtures) {
    const result = redactText(fix(f));
    if (result.text.includes(BLOCKED)) {
      throw new Error(`Fixture "${f}" produced blocked output!`);
    }
  }
});

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
