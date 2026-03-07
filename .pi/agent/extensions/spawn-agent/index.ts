/**
 * Spawn Agent Extension — sub-agent tools with live tree dashboard
 *
 * Tools:
 *   spawn_agent          — run one sub-agent (blocking)
 *   spawn_agents_parallel — run multiple sub-agents concurrently (blocking until all done)
 *
 * UI:
 *   Widget above editor: agent count + [alt+a: view]
 *   alt+a: overlay with tree view (j/k navigate, enter view, ctrl+x clear, esc close)
 */

import type { ExtensionAPI, ExtensionContext, ToolDefinition } from "@mariozechner/pi-coding-agent";
import {
	AuthStorage, createAgentSession, createExtensionRuntime,
	ModelRegistry, type ResourceLoader, SessionManager, SettingsManager,
	createReadTool, createBashTool, createEditTool, createWriteTool,
	createGrepTool, createFindTool, createLsTool,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { matchesKey } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import * as os from "node:os";
import { renderBox } from "./box.js";

// ── Types ────────────────────────────────────────────────────────────────────

interface AgentState {
	id: string;
	parentId: string | null;
	status: "running" | "done" | "error";
	task: string;
	model?: string;
	outputChunks: string[];
	toolCalls: { name: string; args: Record<string, any> }[];
	toolCount: number;
	elapsed: number;
	startTime: number;
	abortSession?: () => Promise<void>;
}

interface AgentResult {
	id: string;
	status: "done" | "error";
	elapsed: number;
	toolCount: number;
	output: string;
	error?: string;
}

// ── Shared state ─────────────────────────────────────────────────────────────

const agents: Map<string, AgentState> = new Map();
let latestCtx: ExtensionContext | null = null;
let overlayRequestRender: (() => void) | null = null;
let globalLetterCounter = 0;

const toLetter = (n: number): string => {
	let result = "", num = n;
	do { result = String.fromCharCode(97 + (num % 26)) + result; num = Math.floor(num / 26) - 1; } while (num >= 0);
	return result;
};
const nextLetter = (): string => toLetter(globalLetterCounter++);

function clearCompletedAgents() {
	const running = new Set<string>();
	for (const [id, a] of agents) { if (a.status === "running") running.add(id); }
	const keep = new Set<string>();
	for (const id of running) {
		keep.add(id);
		const parts = id.split("/");
		for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join("/"));
	}
	for (const id of Array.from(agents.keys())) { if (!keep.has(id)) agents.delete(id); }
}

// ── Formatting ───────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	return `${Math.floor(s / 60)}m${s % 60}s`;
}

function fmtTool(name: string, args: Record<string, any>): string {
	const shorten = (p: string) => {
		const home = os.homedir();
		return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
	};
	switch (name) {
		case "bash": { const c = (args.command as string) || "..."; return `$ ${c.length > 50 ? c.slice(0, 47) + "..." : c}`; }
		case "read": return `read ${shorten((args.file_path || args.path || "...") as string)}`;
		case "write": return `write ${shorten((args.file_path || args.path || "...") as string)}`;
		case "edit": return `edit ${shorten((args.file_path || args.path || "...") as string)}`;
		case "grep": return `grep /${args.pattern || ""}/ in ${shorten((args.path || ".") as string)}`;
		case "find": return `find ${args.pattern || "*"} in ${shorten((args.path || ".") as string)}`;
		case "ls": return `ls ${shorten((args.path || ".") as string)}`;
		case "spawn_agent": { const t = (args.task as string) || "..."; return `spawn: ${t.length > 40 ? t.slice(0, 37) + "..." : t}`; }
		case "spawn_agents_parallel": return `spawn_parallel: ${(args.agents as any[])?.length || "?"} agents`;
		default: { const s = JSON.stringify(args); return `${name} ${s.length > 40 ? s.slice(0, 37) + "..." : s}`; }
	}
}

// ── Tree ─────────────────────────────────────────────────────────────────────

function flattenTree(): Array<{ id: string; depth: number; agent: AgentState }> {
	const result: Array<{ id: string; depth: number; agent: AgentState }> = [];
	function walk(parentId: string | null, depth: number) {
		const children = Array.from(agents.values())
			.filter(a => a.parentId === parentId)
			.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
		for (const agent of children) {
			result.push({ id: agent.id, depth, agent });
			walk(agent.id, depth + 1);
		}
	}
	walk(null, 0);
	return result;
}

// ── Build content lines (pure data, no borders) ─────────────────────────────

function buildAgentsListContent(selectedIndex: number): string[] {
	const tree = flattenTree();
	const lines: string[] = [];
	lines.push(" Agents");
	lines.push("");

	const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
	const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
	const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
	const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;

	for (let i = 0; i < tree.length; i++) {
		const { agent, depth } = tree[i];
		const sel = i === selectedIndex;
		const indent = "  ".repeat(depth);
		const branch = depth > 0 ? "├─ " : "";
		const colorFn = agent.status === "running" ? yellow : agent.status === "done" ? green : red;
		const icon = agent.status === "running" ? "●" : agent.status === "done" ? "✓" : "✗";
		const cursor = sel ? "▸ " : "  ";
		const taskOneLine = agent.task.replace(/[\n\r]+/g, " ").trim();
		lines.push(`${cursor}${indent}${branch}${colorFn(icon)} ${colorFn(agent.id)} ${taskOneLine}  ${formatElapsed(agent.elapsed)} T:${agent.toolCount}`);

		const lastTool = agent.toolCalls.length > 0
			? fmtTool(agent.toolCalls[agent.toolCalls.length - 1].name, agent.toolCalls[agent.toolCalls.length - 1].args)
			: "";
		const lastOut = agent.outputChunks.join("").split("\n").filter(l => l.trim()).pop() || "";
		const detail = lastTool || lastOut || "(no activity)";
		lines.push(dim(`  ${indent}${depth > 0 ? "   " : ""}  → ${detail}`));
	}
	return lines;
}

function buildAgentOutputContent(agentId: string): string[] {
	const agent = agents.get(agentId);
	if (!agent) return [" Agent not found"];

	const yellow = (s: string) => `\x1b[33m${s}\x1b[39m`;
	const green = (s: string) => `\x1b[32m${s}\x1b[39m`;
	const red = (s: string) => `\x1b[31m${s}\x1b[39m`;
	const colorFn = agent.status === "running" ? yellow : agent.status === "done" ? green : red;

	const lines: string[] = [];
	const icon = agent.status === "running" ? "●" : agent.status === "done" ? "✓" : "✗";
	lines.push(` ${colorFn(icon)} ${colorFn(`Agent ${agent.id}`)} | ${formatElapsed(agent.elapsed)} | Tools: ${agent.toolCount}${agent.model ? ` | ${agent.model}` : ""}`);
	lines.push(` ${agent.task}`);
	lines.push("");

	if (agent.toolCalls.length > 0) {
		for (const tc of agent.toolCalls.slice(-10)) {
			lines.push(` → ${fmtTool(tc.name, tc.args)}`);
		}
		lines.push("");
	}

	const fullText = agent.outputChunks.join("");
	for (const ol of fullText.split("\n")) {
		lines.push(` ${ol}`);
	}

	return lines;
}

// ── Rendering (single global timer) ─────────────────────────────────────────

let widgetInstalled = false;
let globalRenderTimer: ReturnType<typeof setInterval> | null = null;

function renderDashboard() {
	if (!latestCtx?.hasUI) return;
	if (overlayRequestRender) { overlayRequestRender(); return; }
	if (agents.size === 0) {
		if (widgetInstalled) { latestCtx.ui.setWidget("agent-dashboard", undefined); widgetInstalled = false; }
		return;
	}
	const running = Array.from(agents.values()).filter(a => a.status === "running").length;
	const done = Array.from(agents.values()).filter(a => a.status === "done").length;
	const errored = Array.from(agents.values()).filter(a => a.status === "error").length;
	const parts: string[] = [];
	if (running > 0) parts.push(`${running} running`);
	if (done > 0) parts.push(`${done} done`);
	if (errored > 0) parts.push(`${errored} failed`);
	widgetInstalled = true;
	latestCtx.ui.setWidget("agent-dashboard", [`🤖 Agents: ${parts.join(", ")}  [alt+a: view]`]);
}

function startGlobalRenderTimer() {
	if (globalRenderTimer) return;
	globalRenderTimer = setInterval(() => {
		let anyRunning = false;
		for (const agent of agents.values()) {
			if (agent.status === "running") { agent.elapsed = Date.now() - agent.startTime; anyRunning = true; }
		}
		renderDashboard();
		if (!anyRunning) stopGlobalRenderTimer();
	}, 1000);
}

function stopGlobalRenderTimer() {
	if (globalRenderTimer) { clearInterval(globalRenderTimer); globalRenderTimer = null; }
}

// ── Minimal ResourceLoader ──────────────────────────────────────────────────

function createMinimalResourceLoader(append?: string): ResourceLoader {
	return {
		getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
		getSkills: () => ({ skills: [], diagnostics: [] }),
		getPrompts: () => ({ prompts: [], diagnostics: [] }),
		getThemes: () => ({ themes: [], diagnostics: [] }),
		getAgentsFiles: () => ({ agentsFiles: [] }),
		getSystemPrompt: () => "You are a helpful coding assistant. Be concise." + (append ? "\n\n" + append : ""),
		getAppendSystemPrompt: () => [],
		getPathMetadata: () => new Map(),
		extendResources: () => {},
		reload: async () => {},
	};
}

// ── Tool factories ──────────────────────────────────────────────────────────

const TOOL_FACTORIES: Record<string, (cwd: string) => any> = {
	read: createReadTool, bash: createBashTool, edit: createEditTool,
	write: createWriteTool, grep: createGrepTool, find: createFindTool, ls: createLsTool,
};
const ALL_TOOL_NAMES = Object.keys(TOOL_FACTORIES);

function resolveTools(toolsParam: string | undefined, cwd: string): any[] {
	if (!toolsParam) return ALL_TOOL_NAMES.map(n => TOOL_FACTORIES[n](cwd));
	return toolsParam.split(",").map(s => s.trim()).filter(n => TOOL_FACTORIES[n]).map(n => TOOL_FACTORIES[n](cwd));
}

// ── Core agent runner (shared by both tools) ─────────────────────────────────

async function runAgent(
	parentId: string | null,
	parentCtx: ExtensionContext,
	params: { task: string; model?: string; tools?: string; systemPrompt?: string; cwd?: string },
	signal?: AbortSignal,
	onUpdate?: (update: any) => void,
): Promise<AgentResult> {
	const letter = nextLetter();
	const id = parentId ? `${parentId}/${letter}` : letter;
	const cwd = params.cwd || parentCtx.cwd || process.cwd();

	let model = parentCtx.model;
	if (params.model && parentCtx.modelRegistry) {
		const parts = params.model.split("/");
		if (parts.length === 2) {
			const found = parentCtx.modelRegistry.find(parts[0], parts[1]);
			if (found) model = found;
		}
	}

	const agent: AgentState = {
		id, parentId, status: "running", task: params.task, model: model?.name,
		outputChunks: [], toolCalls: [], toolCount: 0, elapsed: 0, startTime: Date.now(),
	};
	for (const key of Array.from(agents.keys())) {
		if (key === id || key.startsWith(id + "/")) agents.delete(key);
	}
	agents.set(id, agent);
	startGlobalRenderTimer();

	let session: any = null;
	let progressInterval: ReturnType<typeof setInterval> | null = null;

	try {
		const authStorage = AuthStorage.create();
		const modelRegistry = new ModelRegistry(authStorage);
		const childTools = createChildTools(id, parentCtx);

		const created = await createAgentSession({
			cwd, model: model || undefined, thinkingLevel: "off",
			authStorage, modelRegistry,
			resourceLoader: createMinimalResourceLoader(params.systemPrompt),
			tools: resolveTools(params.tools, cwd),
			customTools: childTools,
			sessionManager: SessionManager.inMemory(),
			settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
		});
		session = created.session;

		agent.abortSession = async () => { try { await session.abort(); } catch {} };

		session.subscribe((event: any) => {
			if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
				agent.outputChunks.push(event.assistantMessageEvent.delta);
			} else if (event.type === "tool_execution_start") {
				agent.toolCount++;
				agent.toolCalls.push({ name: event.toolName, args: event.args || {} });
			}
		});

		progressInterval = setInterval(() => {
			if (agent.status === "running" && onUpdate) {
				const lastLine = agent.outputChunks.join("").split("\n").filter(l => l.trim()).pop() || "(working...)";
				onUpdate({
					content: [{ type: "text", text: `Agent ${id} running... ${formatElapsed(agent.elapsed)} T:${agent.toolCount}\n${lastLine}` }],
					details: { agentId: id, status: "running", toolCount: agent.toolCount },
				});
			}
		}, 2000);

		if (signal) {
			const onAbort = () => { try { session.abort(); } catch {} };
			if (signal.aborted) session.abort();
			else signal.addEventListener("abort", onAbort, { once: true });
		}

		await session.prompt(params.task);
		agent.elapsed = Date.now() - agent.startTime;
		agent.status = "done";

		const output = agent.outputChunks.join("");
		return { id, status: "done", elapsed: agent.elapsed, toolCount: agent.toolCount, output };
	} catch (err: any) {
		agent.elapsed = Date.now() - agent.startTime;
		agent.status = "error";
		agent.outputChunks.push(`\nError: ${err.message}`);
		return { id, status: "error", elapsed: agent.elapsed, toolCount: agent.toolCount, output: "", error: err.message };
	} finally {
		if (progressInterval) clearInterval(progressInterval);
		if (session) { try { session.dispose(); } catch {} }
	}
}

function formatAgentResult(result: AgentResult, maxOutput: number = 8000) {
	const truncated = result.output.length > maxOutput ? result.output.slice(0, maxOutput) + "\n\n... [truncated]" : result.output;
	if (result.status === "error") {
		return {
			content: [{ type: "text" as const, text: `Agent ${result.id} failed: ${result.error}` }],
			details: { agentId: result.id, status: "error", elapsed: result.elapsed, toolCount: result.toolCount },
			isError: true,
		};
	}
	return {
		content: [{ type: "text" as const, text: `Agent ${result.id} completed in ${formatElapsed(result.elapsed)} (${result.toolCount} tool calls)\n\n${truncated}` }],
		details: { agentId: result.id, status: "done", elapsed: result.elapsed, toolCount: result.toolCount },
	};
}

// ── Child tools (both spawn_agent and spawn_agents_parallel, for recursion) ──

function createChildTools(parentId: string, parentCtx: ExtensionContext): ToolDefinition[] {
	return [
		{
			name: "spawn_agent",
			label: "Spawn Agent",
			description: "Spawn a sub-agent in an isolated session. Blocking — waits for the sub-agent to finish.",
			parameters: Type.Object({
				task: Type.String({ description: "The task/prompt for the sub-agent" }),
				model: Type.Optional(Type.String({ description: "Model override" })),
				tools: Type.Optional(Type.String({ description: "Comma-separated tool list" })),
				systemPrompt: Type.Optional(Type.String({ description: "Additional system prompt" })),
				cwd: Type.Optional(Type.String({ description: "Working directory" })),
			}),
			async execute(_id, params, signal, onUpdate, _ctx) {
				return formatAgentResult(await runAgent(parentId, parentCtx, params, signal, onUpdate));
			},
		},
		{
			name: "spawn_agents_parallel",
			label: "Spawn Agents (Parallel)",
			description: "Spawn multiple sub-agents that run concurrently. Blocks until ALL agents complete. Use this when tasks are independent and can run in parallel.",
			parameters: Type.Object({
				agents: Type.Array(Type.Object({
					task: Type.String({ description: "The task/prompt for this sub-agent" }),
					model: Type.Optional(Type.String({ description: "Model override" })),
					tools: Type.Optional(Type.String({ description: "Comma-separated tool list" })),
					systemPrompt: Type.Optional(Type.String({ description: "Additional system prompt" })),
					cwd: Type.Optional(Type.String({ description: "Working directory" })),
				}), { description: "Array of agent specs to run in parallel" }),
			}),
			async execute(_id, params, signal, onUpdate, _ctx) {
				const results = await Promise.all(
					params.agents.map((spec: any) => runAgent(parentId, parentCtx, spec, signal, onUpdate))
				);
				const summary = results.map(r => {
					const maxOutput = 4000;
					const truncated = r.output.length > maxOutput ? r.output.slice(0, maxOutput) + "\n... [truncated]" : r.output;
					const icon = r.status === "done" ? "✓" : "✗";
					return `${icon} Agent ${r.id} (${formatElapsed(r.elapsed)}, ${r.toolCount} tools)${r.error ? `: ${r.error}` : ""}\n${truncated}`;
				}).join("\n\n---\n\n");
				const allDone = results.every(r => r.status === "done");
				return {
					content: [{ type: "text", text: `${results.length} agents completed${allDone ? "" : " (some failed)"}\n\n${summary}` }],
					details: { status: allDone ? "done" : "partial", count: results.length, agents: results.map(r => ({ id: r.id, status: r.status })) },
				};
			},
		},
	];
}

// ── Overlay components ───────────────────────────────────────────────────────

const BOX_HEIGHT = 30;

class AgentsListOverlay {
	private tui: { requestRender: () => void };
	private done: (v: void) => void;
	private resolve: (r: { agentId: string; cursorIndex: number } | null) => void;
	selectedIndex: number;
	scrollOffset: number = 0;

	constructor(tui: { requestRender: () => void }, done: (v: void) => void,
		resolve: (r: { agentId: string; cursorIndex: number } | null) => void, initialIndex: number) {
		this.tui = tui; this.done = done; this.resolve = resolve; this.selectedIndex = initialIndex;
		overlayRequestRender = () => tui.requestRender();
	}

	private ensureVisible() {
		// Each agent occupies 2 lines in content (agent line + detail), plus 2 header lines
		const HEADER_LINES = 2;
		const LINES_PER_AGENT = 2;
		// footer takes 2 lines, borders take 2 lines
		const visibleContentLines = BOX_HEIGHT - 2 - 2;

		const selectedContentStart = HEADER_LINES + this.selectedIndex * LINES_PER_AGENT;
		const selectedContentEnd = selectedContentStart + LINES_PER_AGENT - 1;

		// Scroll down if selected item is below visible area
		if (selectedContentEnd >= this.scrollOffset + visibleContentLines) {
			this.scrollOffset = selectedContentEnd - visibleContentLines + 1;
		}
		// Scroll up if selected item is above visible area
		if (selectedContentStart < this.scrollOffset) {
			this.scrollOffset = selectedContentStart;
		}
	}

	render(width: number): string[] {
		const content = buildAgentsListContent(this.selectedIndex);
		this.ensureVisible();
		return renderBox(content, width, BOX_HEIGHT, this.scrollOffset, " j/k: navigate  enter: view  ctrl+x: clear done  esc: close");
	}

	invalidate(): void {}

	handleInput(data: string): void {
		const tree = flattenTree();
		if (matchesKey(data, "j") || matchesKey(data, "down")) {
			this.selectedIndex = Math.min(this.selectedIndex + 1, tree.length - 1);
			this.tui.requestRender();
		} else if (matchesKey(data, "k") || matchesKey(data, "up")) {
			this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
			this.tui.requestRender();
		} else if (matchesKey(data, "enter")) {
			const item = tree[this.selectedIndex];
			if (item) { this.done(); this.resolve({ agentId: item.id, cursorIndex: this.selectedIndex }); }
		} else if (matchesKey(data, "ctrl+x")) {
			clearCompletedAgents();
			this.selectedIndex = 0; this.scrollOffset = 0;
			const remaining = flattenTree();
			if (remaining.length === 0) { this.done(); this.resolve(null); }
			else { this.tui.requestRender(); }
		} else if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.done(); this.resolve(null);
		}
	}
}

class AgentOutputOverlay {
	private tui: { requestRender: () => void };
	private done: (v: void) => void;
	private resolve: (goBack: boolean) => void;
	private agentId: string;
	private scrollOffset: number = 0;

	constructor(tui: { requestRender: () => void }, done: (v: void) => void,
		resolve: (goBack: boolean) => void, agentId: string) {
		this.tui = tui; this.done = done; this.resolve = resolve; this.agentId = agentId;
		overlayRequestRender = () => tui.requestRender();
	}

	private maxScroll(contentLen: number): number {
		const visibleLines = BOX_HEIGHT - 2 - 2; // borders + footer
		return Math.max(0, contentLen - visibleLines);
	}

	render(width: number): string[] {
		const content = buildAgentOutputContent(this.agentId);
		this.scrollOffset = Math.min(this.scrollOffset, this.maxScroll(content.length));
		return renderBox(content, width, BOX_HEIGHT, this.scrollOffset, " j/k: scroll  esc: back to list  ctrl+c: close all");
	}

	invalidate(): void {}

	handleInput(data: string): void {
		if (matchesKey(data, "j") || matchesKey(data, "down")) {
			const content = buildAgentOutputContent(this.agentId);
			this.scrollOffset = Math.min(this.scrollOffset + 1, this.maxScroll(content.length));
			this.tui.requestRender();
		} else if (matchesKey(data, "k") || matchesKey(data, "up")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			this.tui.requestRender();
		} else if (matchesKey(data, "escape")) { this.done(); this.resolve(true); }
		else if (matchesKey(data, "ctrl+c")) { this.done(); this.resolve(false); }
	}
}

async function showAgentsOverlay(ctx: ExtensionContext) {
	if (agents.size === 0) { ctx.ui.notify("No agents", "info"); return; }
	let selectedIndex = 0;
	try {
		while (true) {
			const result = await new Promise<{ agentId: string; cursorIndex: number } | null>((resolve) => {
				ctx.ui.custom<void>((tui, _theme, _kb, done) =>
					new AgentsListOverlay(tui, done, resolve, selectedIndex),
				{ overlay: true, overlayOptions: { anchor: "center", width: "90%", margin: 1 } });
			});
			if (result === null) break;
			selectedIndex = result.cursorIndex;

			const goBack = await new Promise<boolean>((resolve) => {
				ctx.ui.custom<void>((tui, _theme, _kb, done) =>
					new AgentOutputOverlay(tui, done, resolve, result.agentId),
				{ overlay: true, overlayOptions: { anchor: "center", width: "90%", margin: 1 } });
			});
			if (!goBack) break;
		}
	} finally {
		overlayRequestRender = null;
		renderDashboard();
	}
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {

	// Top-level spawn_agent tool
	pi.registerTool({
		name: "spawn_agent",
		label: "Spawn Agent",
		description: "Spawn a sub-agent in an isolated session. The sub-agent runs with its own context window and returns the result. Blocking — waits for the sub-agent to finish. Use 'model' to specify a different model (e.g., codex-mini for coding, claude-opus-4 for planning). Use 'tools' to restrict which tools the sub-agent has access to.",
		parameters: Type.Object({
			task: Type.String({ description: "The task/prompt for the sub-agent" }),
			model: Type.Optional(Type.String({ description: "Model override (e.g., codex-mini, claude-opus-4). Defaults to current model." })),
			tools: Type.Optional(Type.String({ description: "Comma-separated tool list (e.g., read,grep,find,ls,bash). Defaults to all tools." })),
			systemPrompt: Type.Optional(Type.String({ description: "Additional system prompt to append for the sub-agent" })),
			cwd: Type.Optional(Type.String({ description: "Working directory for the sub-agent process" })),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			latestCtx = ctx;
			return formatAgentResult(await runAgent(null, ctx, params, signal, onUpdate));
		},

		renderCall(args, theme) {
			const model = args.model ? theme.fg("dim", ` [${args.model}]`) : "";
			const tp = args.task ? (args.task.length > 60 ? args.task.slice(0, 57) + "..." : args.task) : "...";
			return new Text(theme.fg("toolTitle", theme.bold("spawn_agent")) + model + "\n" + theme.fg("dim", "  " + tp), 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const d = result.details as any;
			if (!d) { const t = result.content[0]; return new Text(t?.type === "text" ? t.text : "(no output)", 0, 0); }
			if (isPartial || d.status === "running") {
				const t = result.content[0];
				return new Text(theme.fg("accent", `● Agent ${d.agentId}`) + theme.fg("dim", " running...") + "\n" + theme.fg("muted", t?.type === "text" ? t.text : "(working...)"), 0, 0);
			}
			const icon = d.status === "done" ? "✓" : "✗";
			const color = d.status === "done" ? "success" : "error";
			const hdr = theme.fg(color, `${icon} Agent ${d.agentId}`) + theme.fg("dim", ` ${formatElapsed(d.elapsed)} T:${d.toolCount}`);
			const t = result.content[0];
			const full = t?.type === "text" ? t.text : "(no output)";
			if (expanded) return new Text(hdr + "\n\n" + full, 0, 0);
			const ol = full.split("\n").filter(l => l.trim());
			const pv = ol.slice(1, 6);
			const preview = pv.length > 0 ? "\n" + theme.fg("muted", pv.join("\n")) : "";
			const more = ol.length > 6 ? "\n" + theme.fg("dim", `... ${ol.length - 6} more lines (ctrl+o to expand)`) : "";
			return new Text(hdr + preview + more, 0, 0);
		},
	});

	// Top-level spawn_agents_parallel tool
	pi.registerTool({
		name: "spawn_agents_parallel",
		label: "Spawn Agents (Parallel)",
		description: "Spawn multiple sub-agents that run concurrently. Blocks until ALL agents complete. Use this when tasks are independent and can run in parallel. Each agent gets its own isolated session.",
		parameters: Type.Object({
			agents: Type.Array(Type.Object({
				task: Type.String({ description: "The task/prompt for this sub-agent" }),
				model: Type.Optional(Type.String({ description: "Model override" })),
				tools: Type.Optional(Type.String({ description: "Comma-separated tool list" })),
				systemPrompt: Type.Optional(Type.String({ description: "Additional system prompt" })),
				cwd: Type.Optional(Type.String({ description: "Working directory" })),
			}), { description: "Array of agent specs to run in parallel" }),
		}),

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			latestCtx = ctx;
			const results = await Promise.all(
				params.agents.map((spec: any) => runAgent(null, ctx, spec, signal, onUpdate))
			);
			const summary = results.map(r => {
				const maxOutput = 4000;
				const truncated = r.output.length > maxOutput ? r.output.slice(0, maxOutput) + "\n... [truncated]" : r.output;
				const icon = r.status === "done" ? "✓" : "✗";
				return `${icon} Agent ${r.id} (${formatElapsed(r.elapsed)}, ${r.toolCount} tools)${r.error ? `: ${r.error}` : ""}\n${truncated}`;
			}).join("\n\n---\n\n");
			const allDone = results.every(r => r.status === "done");
			return {
				content: [{ type: "text", text: `${results.length} agents completed${allDone ? "" : " (some failed)"}\n\n${summary}` }],
				details: { status: allDone ? "done" : "partial", count: results.length, agents: results.map(r => ({ id: r.id, status: r.status })) },
			};
		},

		renderCall(args, theme) {
			const count = args.agents?.length || 0;
			const tasks = (args.agents || []).map((a: any) => {
				const t = a.task || "...";
				return theme.fg("dim", "  • " + (t.length > 55 ? t.slice(0, 52) + "..." : t));
			}).join("\n");
			return new Text(theme.fg("toolTitle", theme.bold("spawn_agents_parallel")) + theme.fg("dim", ` (${count} agents)`) + "\n" + tasks, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const d = result.details as any;
			if (!d) { const t = result.content[0]; return new Text(t?.type === "text" ? t.text : "(no output)", 0, 0); }
			const hdr = theme.fg(d.status === "done" ? "success" : "warning", `${d.count} agents completed`);
			const t = result.content[0];
			const full = t?.type === "text" ? t.text : "(no output)";
			if (expanded) return new Text(hdr + "\n\n" + full, 0, 0);
			const agentSummaries = (d.agents || []).map((a: any) => {
				const icon = a.status === "done" ? "✓" : "✗";
				const color = a.status === "done" ? "success" : "error";
				return theme.fg(color, `  ${icon} ${a.id}`);
			}).join("\n");
			return new Text(hdr + "\n" + agentSummaries, 0, 0);
		},
	});

	pi.registerShortcut("alt+a", {
		description: "Open agents list",
		handler: async (ctx) => { latestCtx = ctx; await showAgentsOverlay(ctx); },
	});

	pi.registerCommand("agents", {
		description: "Open agents list overlay",
		handler: async (_args, ctx) => { latestCtx = ctx; await showAgentsOverlay(ctx); },
	});

	pi.registerCommand("agents-clear", {
		description: "Clear finished agents",
		handler: async (_args, ctx) => {
			latestCtx = ctx;
			clearCompletedAgents();
			renderDashboard();
			ctx.ui.notify("Cleared finished agents", "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		latestCtx = ctx; stopGlobalRenderTimer();
		await Promise.allSettled(Array.from(agents.values()).map(a => a.abortSession?.()));
		agents.clear(); globalLetterCounter = 0; widgetInstalled = false;
		ctx.ui.setWidget("agent-dashboard", undefined);
	});

	pi.on("session_shutdown", async () => {
		stopGlobalRenderTimer();
		await Promise.allSettled(Array.from(agents.values()).map(a => a.abortSession?.()));
		agents.clear();
	});
}
