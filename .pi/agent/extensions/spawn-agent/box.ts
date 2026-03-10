/**
 * Pure functional box renderer.
 * Uses pi-tui utilities for ANSI-safe string operations.
 */

import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

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
	const reservedForFooter = hasFooter ? 2 : 0;
	const contentHeight = h - 2 - reservedForFooter;

	const rule = (left: string, right: string) =>
		left + "─".repeat(inner) + right;

	const bordered = (content: string) =>
		"│" + truncateToWidth(content.replace(/[\n\r\t]/g, " "), inner, "", true) + "│";

	const visibleContent = contentLines.slice(scrollOffset, scrollOffset + contentHeight);
	const paddedContent = padArray(visibleContent, contentHeight, "");
	const contentRows = paddedContent.map(bordered);

	const footerRows = hasFooter
		? [rule("├", "┤"), bordered(footer!)]
		: [];

	return [
		rule("┌", "┐"),
		...contentRows,
		...footerRows,
		rule("└", "┘"),
	];
};
