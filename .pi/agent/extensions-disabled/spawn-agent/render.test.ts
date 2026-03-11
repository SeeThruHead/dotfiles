/**
 * Test that the rendering utilities and color helpers work correctly.
 * Tests box.ts + the color/formatting helpers used in index.ts.
 */

import { renderBox } from "./box.js";
import { visibleWidth, truncateToWidth } from "@mariozechner/pi-tui";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
	if (condition) { passed++; }
	else { failed++; console.error(`FAIL: ${msg}`); }
}

function assertEq(actual: any, expected: any, msg: string) {
	if (actual === expected) { passed++; }
	else { failed++; console.error(`FAIL: ${msg}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`); }
}

// ── Color helpers (same as in index.ts) ──

const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;

// ── pi-tui utilities work correctly ──

assertEq(visibleWidth("hello"), 5, "visibleWidth: plain");
assertEq(visibleWidth(yellow("hello")), 5, "visibleWidth: yellow ansi");
assertEq(visibleWidth(dim("hello")), 5, "visibleWidth: dim ansi");
assertEq(visibleWidth(""), 0, "visibleWidth: empty");

// truncateToWidth basics
assertEq(visibleWidth(truncateToWidth("hello world", 5, "")), 5, "truncateToWidth: basic len");
assertEq(visibleWidth(truncateToWidth("hi", 10, "", true)), 10, "truncateToWidth: pad to width");
assert(truncateToWidth("hello world", 8).includes("…") || truncateToWidth("hello world", 8).includes("..."), "truncateToWidth: adds ellipsis");

// truncateToWidth with ANSI
{
	const result = truncateToWidth(yellow("hello world"), 5, "");
	assertEq(visibleWidth(result), 5, "truncateToWidth: ansi preserves width");
}

// ── renderBox with colored content ──

{
	const lines = [
		`▸ ${green("✓")} ${green("agent-a")} task description  5s T:3`,
		dim(`    → $ ls -la`),
	];
	const box = renderBox(lines, 60, 6, 0, " j/k: navigate  esc: close");

	assertEq(box.length, 6, "colored box: height");
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleWidth(box[i]), 60, `colored box: line ${i} width`);
	}
	assert(box[1].startsWith("│"), "colored box: left border on content");
	assert(box[1].endsWith("│"), "colored box: right border on content");
	assert(box[1].includes("✓"), "colored box: icon present");
	assert(box[1].includes("agent-a"), "colored box: agent id present");
}

// ── renderBox scrolling with colored content ──

{
	const lines = Array.from({ length: 20 }, (_, i) =>
		`${green("✓")} agent-${i} task ${i}  ${i}s T:${i}`
	);
	const box = renderBox(lines, 40, 8, 5);

	assertEq(box.length, 8, "scroll colored: height");
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleWidth(box[i]), 40, `scroll colored: line ${i} width`);
	}
	// First content line should be index 5 (agent-5)
	assert(box[1].includes("agent-5"), "scroll colored: correct scroll offset");
}

// ── Long colored content truncation ──

{
	const longLine = yellow("●") + " " + green("very-long-agent-name-that-exceeds-the-box-width") + " " + dim("some very long task description that goes on and on");
	const box = renderBox([longLine], 30, 3);

	assertEq(visibleWidth(box[1]), 30, "long colored: width capped");
	assert(box[1].startsWith("│"), "long colored: left border");
	assert(box[1].endsWith("│"), "long colored: right border");
}

// ── Empty colored box ──

{
	const box = renderBox([], 30, 5);
	assertEq(box.length, 5, "empty colored: height");
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleWidth(box[i]), 30, `empty colored: line ${i} width`);
	}
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
