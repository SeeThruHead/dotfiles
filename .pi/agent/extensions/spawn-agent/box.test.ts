import { stripAnsi, visibleLen, truncate, renderBox } from "./box.js";

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

// ── stripAnsi ──
assertEq(stripAnsi("hello"), "hello", "stripAnsi: no ansi");
assertEq(stripAnsi("\x1b[1mhello\x1b[22m"), "hello", "stripAnsi: bold");
assertEq(stripAnsi("\x1b[2m│\x1b[22m content \x1b[2m│\x1b[22m"), "│ content │", "stripAnsi: dim borders");

// ── visibleLen ──
assertEq(visibleLen("hello"), 5, "visibleLen: plain");
assertEq(visibleLen("\x1b[1mhello\x1b[22m"), 5, "visibleLen: bold");
assertEq(visibleLen(""), 0, "visibleLen: empty");

// ── truncate ──
assertEq(truncate("hello world", 5), "hello", "truncate: basic");
assertEq(truncate("hello", 10), "hello", "truncate: no-op");
assertEq(truncate("", 5), "", "truncate: empty");
assertEq(truncate("hello", 0), "", "truncate: zero");
assertEq(visibleLen(truncate("\x1b[1mhello world\x1b[22m", 5)), 5, "truncate: ansi visible len");
assertEq(truncate("abcdefgh", 3), "abc", "truncate: exact");

// ── renderBox ──

// Basic: 10 wide, 5 tall, no content
{
	const box = renderBox([], 10, 5);
	assertEq(box.length, 5, "empty box: height");
	assertEq(box[0], "┌────────┐", "empty box: top border");
	assertEq(box[4], "└────────┘", "empty box: bottom border");
	assertEq(box[1], "│        │", "empty box: empty line");
	assertEq(box[2], "│        │", "empty box: empty line 2");
	assertEq(box[3], "│        │", "empty box: empty line 3");
	// All lines same visible width
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleLen(box[i]), 10, `empty box: line ${i} width`);
	}
}

// Content that fits
{
	const box = renderBox(["hello", "world"], 12, 5);
	assertEq(box.length, 5, "fit box: height");
	assertEq(box[0], "┌──────────┐", "fit box: top");
	assertEq(box[1], "│hello     │", "fit box: line 1");
	assertEq(box[2], "│world     │", "fit box: line 2");
	assertEq(box[3], "│          │", "fit box: padded");
	assertEq(box[4], "└──────────┘", "fit box: bottom");
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleLen(box[i]), 12, `fit box: line ${i} width`);
	}
}

// Content truncated (too long)
{
	const box = renderBox(["abcdefghijklmnop"], 10, 3);
	assertEq(box.length, 3, "trunc box: height");
	assertEq(box[1], "│abcdefgh│", "trunc box: truncated content");
	assertEq(visibleLen(box[1]), 10, "trunc box: line width");
}

// More content than height (clipped)
{
	const box = renderBox(["a", "b", "c", "d", "e"], 6, 4);
	// height=4 means top + 2 content + bottom
	assertEq(box.length, 4, "clip box: height");
	assertEq(box[1], "│a   │", "clip box: line 1");
	assertEq(box[2], "│b   │", "clip box: line 2 (c,d,e clipped)");
}

// Scroll offset
{
	const box = renderBox(["a", "b", "c", "d", "e"], 6, 4, 2);
	assertEq(box[1], "│c   │", "scroll box: line 1 (offset=2)");
	assertEq(box[2], "│d   │", "scroll box: line 2");
}

// ANSI content
{
	const box = renderBox(["\x1b[1mbold text\x1b[22m"], 12, 3);
	assertEq(visibleLen(box[1]), 12, "ansi box: line width correct");
	assert(box[1].includes("bold text"), "ansi box: content present");
	assert(box[1].startsWith("│"), "ansi box: left border");
	assert(box[1].endsWith("│"), "ansi box: right border");
}

// ANSI content truncated
{
	const box = renderBox(["\x1b[1mhello world long text\x1b[22m"], 10, 3);
	assertEq(visibleLen(box[1]), 10, "ansi trunc box: width");
	assert(box[1].startsWith("│"), "ansi trunc box: left border");
	assert(box[1].endsWith("│"), "ansi trunc box: right border");
}

// Content with embedded newlines (must not break the box)
{
	const box = renderBox(["line one\nline two\nline three"], 20, 4);
	assertEq(box.length, 4, "newline box: height");
	for (let i = 0; i < box.length; i++) {
		assert(!box[i].includes("\n"), `newline box: line ${i} has no newline`);
		assertEq(visibleLen(box[i]), 20, `newline box: line ${i} width`);
	}
	// The newlines should be replaced with spaces
	assert(box[1].includes("line one"), "newline box: content present");
	assert(box[1].includes("line two"), "newline box: newline replaced with space");
}

// Content with tabs
{
	const box = renderBox(["col1\tcol2"], 20, 3);
	assert(!box[1].includes("\t"), "tab box: no tab in output");
	assertEq(visibleLen(box[1]), 20, "tab box: width");
}

// Footer
{
	const box = renderBox(["content"], 20, 6, 0, " esc: close");
	assertEq(box.length, 6, "footer box: height");
	assertEq(box[0], "┌──────────────────┐", "footer box: top");
	assert(box[3].startsWith("├"), "footer box: separator");
	assert(box[4].includes("esc: close"), "footer box: footer text");
	assertEq(box[5], "└──────────────────┘", "footer box: bottom");
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleLen(box[i]), 20, `footer box: line ${i} width`);
	}
}

// No footer (undefined)
{
	const box = renderBox(["content"], 20, 5, 0);
	assertEq(box.length, 5, "no footer box: height");
	assertEq(box[4], "└──────────────────┘", "no footer: bottom border");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
