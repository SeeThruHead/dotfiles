import { renderBox } from "./box.js";
import { visibleWidth } from "@mariozechner/pi-tui";

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

// ── renderBox ──

// Basic: 10 wide, 5 tall, no content
{
	const box = renderBox([], 10, 5);
	assertEq(box.length, 5, "empty box: height");
	assertEq(box[0], "┌────────┐", "empty box: top border");
	assertEq(box[4], "└────────┘", "empty box: bottom border");
	// All lines same visible width
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleWidth(box[i]), 10, `empty box: line ${i} width`);
	}
}

// Content that fits
{
	const box = renderBox(["hello", "world"], 12, 5);
	assertEq(box.length, 5, "fit box: height");
	assertEq(box[0], "┌──────────┐", "fit box: top");
	assertEq(visibleWidth(box[1]), 12, "fit box: line 1 width");
	assert(box[1].includes("hello"), "fit box: line 1 has hello");
	assertEq(visibleWidth(box[2]), 12, "fit box: line 2 width");
	assert(box[2].includes("world"), "fit box: line 2 has world");
	assertEq(box[4], "└──────────┘", "fit box: bottom");
	for (let i = 0; i < box.length; i++) {
		assertEq(visibleWidth(box[i]), 12, `fit box: line ${i} width`);
	}
}

// Content truncated (too long)
{
	const box = renderBox(["abcdefghijklmnop"], 10, 3);
	assertEq(box.length, 3, "trunc box: height");
	assertEq(visibleWidth(box[1]), 10, "trunc box: line width");
	assert(box[1].startsWith("│"), "trunc box: left border");
	assert(box[1].endsWith("│"), "trunc box: right border");
	// Content should be truncated to 8 visible chars (10 - 2 borders)
	assert(box[1].includes("abcdefgh"), "trunc box: content truncated");
}

// More content than height (clipped)
{
	const box = renderBox(["a", "b", "c", "d", "e"], 6, 4);
	// height=4 means top + 2 content + bottom
	assertEq(box.length, 4, "clip box: height");
	assert(box[1].includes("a"), "clip box: line 1 has a");
	assert(box[2].includes("b"), "clip box: line 2 has b (c,d,e clipped)");
}

// Scroll offset
{
	const box = renderBox(["a", "b", "c", "d", "e"], 6, 4, 2);
	assert(box[1].includes("c"), "scroll box: line 1 has c (offset=2)");
	assert(box[2].includes("d"), "scroll box: line 2 has d");
}

// ANSI content
{
	const box = renderBox(["\x1b[1mbold text\x1b[22m"], 12, 3);
	assertEq(visibleWidth(box[1]), 12, "ansi box: line width correct");
	assert(box[1].includes("bold text"), "ansi box: content present");
	assert(box[1].startsWith("│"), "ansi box: left border");
	assert(box[1].endsWith("│"), "ansi box: right border");
}

// ANSI content truncated
{
	const box = renderBox(["\x1b[1mhello world long text\x1b[22m"], 10, 3);
	assertEq(visibleWidth(box[1]), 10, "ansi trunc box: width");
	assert(box[1].startsWith("│"), "ansi trunc box: left border");
	assert(box[1].endsWith("│"), "ansi trunc box: right border");
}

// Content with embedded newlines (must not break the box)
{
	const box = renderBox(["line one\nline two\nline three"], 20, 4);
	assertEq(box.length, 4, "newline box: height");
	for (let i = 0; i < box.length; i++) {
		assert(!box[i].includes("\n"), `newline box: line ${i} has no newline`);
		assertEq(visibleWidth(box[i]), 20, `newline box: line ${i} width`);
	}
	// The newlines should be replaced with spaces
	assert(box[1].includes("line one"), "newline box: content present");
	assert(box[1].includes("line two"), "newline box: newline replaced with space");
}

// Content with tabs
{
	const box = renderBox(["col1\tcol2"], 20, 3);
	assert(!box[1].includes("\t"), "tab box: no tab in output");
	assertEq(visibleWidth(box[1]), 20, "tab box: width");
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
		assertEq(visibleWidth(box[i]), 20, `footer box: line ${i} width`);
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
