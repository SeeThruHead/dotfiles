/**
 * Pure functional box renderer.
 * All functions are pure transformations over string arrays.
 */

/** Strip ANSI escape codes */
export const stripAnsi = (s: string): string =>
	s.replace(/\x1b\[[0-9;]*m/g, "");

/** Visible character count (excluding ANSI) */
export const visibleLen = (s: string): number =>
	stripAnsi(s).length;

/** Truncate to at most `max` visible characters, preserving ANSI codes before cutoff */
export const truncate = (s: string, max: number): string => {
	if (max <= 0) return "";
	let visible = 0, i = 0;
	while (i < s.length) {
		if (s[i] === "\x1b" && s[i + 1] === "[") {
			const end = s.indexOf("m", i);
			// Skip valid ANSI sequences; treat malformed ones as visible chars
			if (end !== -1 && end - i < 20) { i = end + 1; continue; }
		}
		visible++;
		if (visible > max) break;
		i++;
	}
	return s.slice(0, i);
};

/** Sanitize a string: replace newlines/tabs with spaces */
const sanitize = (s: string): string =>
	s.replace(/[\n\r\t]/g, " ");

/** Pad/truncate a string to exactly `width` visible chars */
const fitToWidth = (s: string, width: number): string => {
	const t = truncate(sanitize(s), width);
	const pad = Math.max(0, width - visibleLen(t));
	return t + " ".repeat(pad);
};

/** Wrap content in left/right border chars */
const bordered = (content: string, inner: number): string =>
	"│" + fitToWidth(content, inner) + "│";

/** A horizontal rule: ┌──┐, ├──┤, or └──┘ */
const rule = (left: string, right: string, inner: number): string =>
	left + "─".repeat(inner) + right;

/** Pad an array to exactly `n` items, filling with `fill` */
const padArray = <T>(arr: T[], n: number, fill: T): T[] =>
	arr.length >= n ? arr.slice(0, n) : [...arr, ...Array(n - arr.length).fill(fill)];

/**
 * Render a bordered box.
 *
 * @param contentLines - array of content strings (may contain ANSI codes)
 * @param width        - total visible width including borders
 * @param height       - total line count including borders
 * @param scrollOffset - first content line to show
 * @param footer       - optional footer text pinned above bottom border
 * @returns string[] of exactly `height` lines, each exactly `width` visible chars
 */
export const renderBox = (
	contentLines: string[],
	width: number,
	height: number,
	scrollOffset: number = 0,
	footer?: string,
): string[] => {
	const w = Math.max(4, width);
	const h = Math.max(3, height);
	const inner = w - 2;
	const hasFooter = footer !== undefined && footer.length > 0;
	const reservedForFooter = hasFooter ? 2 : 0; // separator + footer line
	const contentHeight = h - 2 - reservedForFooter;

	const visibleContent = contentLines.slice(scrollOffset, scrollOffset + contentHeight);
	const paddedContent = padArray(visibleContent, contentHeight, "");
	const contentRows = paddedContent.map(line => bordered(line, inner));

	const footerRows = hasFooter
		? [rule("├", "┤", inner), bordered(footer!, inner)]
		: [];

	return [
		rule("┌", "┐", inner),
		...contentRows,
		...footerRows,
		rule("└", "┘", inner),
	];
};
