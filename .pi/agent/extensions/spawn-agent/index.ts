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
	DefaultResourceLoader, getAgentDir,
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

interface TreeNode { id: string; depth: number; agent: AgentState; prefix: string }

function flattenTree(): TreeNode[] {
	const result: TreeNode[] = [];
	function walk(parentId: string | null, depth: number, parentPrefix: string) {
		const children = Array.from(agents.values())
			.filter(a => a.parentId === parentId)
			.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
		for (let i = 0; i < children.length; i++) {
			const agent = children[i];
			const isLast = i === children.length - 1;
			const connector = depth === 0 ? "" : (isLast ? "└─ " : "├─ ");
			const prefix = parentPrefix + connector;
			// For children of this node, extend the prefix with either "│  " or "   "
			const childPrefix = depth === 0 ? "" : parentPrefix + (isLast ? "   " : "│  ");
			result.push({ id: agent.id, depth, agent, prefix });
			walk(agent.id, depth + 1, childPrefix);
		}
	}
	walk(null, 0, "");
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
		const { agent, depth, prefix } = tree[i];
		const sel = i === selectedIndex;
		const colorFn = agent.status === "running" ? yellow : agent.status === "done" ? green : red;
		const icon = agent.status === "running" ? "●" : agent.status === "done" ? "✓" : "✗";
		const cursor = sel ? "▸ " : "  ";
		const taskOneLine = agent.task.replace(/[\n\r]+/g, " ").trim();
		lines.push(`${cursor}${prefix}${colorFn(icon)} ${colorFn(agent.id)} ${taskOneLine}  ${formatElapsed(agent.elapsed)} T:${agent.toolCount}`);

		// Detail line — continuation prefix keeps the tree lines connected
		const detailPrefix = depth === 0 ? "    " : prefix.replace(/[├└]─ $/, "   ").replace(/│  $/, "│  ");
		const lastTool = agent.toolCalls.length > 0
			? fmtTool(agent.toolCalls[agent.toolCalls.length - 1].name, agent.toolCalls[agent.toolCalls.length - 1].args)
			: "";
		const lastOut = agent.outputChunks.join("").split("\n").filter(l => l.trim()).pop() || "";
		const detail = lastTool || lastOut || "(no activity)";
		lines.push(dim(`  ${detailPrefix}  → ${detail}`));
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

function agentStatusText(): string {
	if (agents.size === 0) return "no agents";
	const running = Array.from(agents.values()).filter(a => a.status === "running").length;
	const done = Array.from(agents.values()).filter(a => a.status === "done").length;
	const errored = Array.from(agents.values()).filter(a => a.status === "error").length;
	const parts: string[] = [];
	if (running > 0) parts.push(`${running} running`);
	if (done > 0) parts.push(`${done} done`);
	if (errored > 0) parts.push(`${errored} failed`);
	return parts.join(", ");
}

function setStatusBarWidget() {
	if (!latestCtx?.hasUI) return;
	const dim = (s: string) => `\x1b[2m${s}\x1b[22m`;
	latestCtx.ui.setWidget("agent-status-bar", (_tui, _theme) => ({
		render(width: number): string[] {
			const border = dim("─".repeat(width));
			const agentSection = `🤖 ${agentStatusText()}`;
			const keyHint = agents.size > 0 ? dim("  alt+a: view") : "";
			return [border, ` ${agentSection}${keyHint}`];
		},
		invalidate() {},
	}));
	widgetInstalled = true;
}

function renderDashboard() {
	if (!latestCtx?.hasUI) return;
	if (overlayRequestRender) { overlayRequestRender(); return; }
	setStatusBarWidget();
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

const SUB_AGENT_SYSTEM_PROMPT = `You are an autonomous sub-agent. You must follow these rules:

1. NEVER ask for clarification or user input — there is no human on the other end.
2. ALWAYS complete your task and return a result. Do not stop mid-way.
3. Be concise. Return your result directly, no preamble.
4. If you encounter an error, report it and move on. Do not ask what to do.
5. If the task is ambiguous, make a reasonable choice and execute it.
6. You may kill your own process (kill $$) if asked — this is safe, your parent handles cleanup.
7. Use normal judgment about destructive operations (don't rm -rf /, etc.) but do not refuse tasks just because they seem unusual.`;

// ── Resource loader for sub-agents ──────────────────────────────────────────

async function createSubAgentResourceLoader(opts: {
	cwd: string;
	systemPrompt?: string;
	skills?: string[];
	extensions?: string[];
}): Promise<ResourceLoader> {
	const hasSkills = opts.skills && opts.skills.length > 0;
	const hasExtensions = opts.extensions && opts.extensions.length > 0;

	// If no skills or extensions requested, use minimal loader (fast, no disk I/O)
	if (!hasSkills && !hasExtensions) {
		const append = opts.systemPrompt;
		return {
			getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
			getSkills: () => ({ skills: [], diagnostics: [] }),
			getPrompts: () => ({ prompts: [], diagnostics: [] }),
			getThemes: () => ({ themes: [], diagnostics: [] }),
			getAgentsFiles: () => ({ agentsFiles: [] }),
			getSystemPrompt: () => SUB_AGENT_SYSTEM_PROMPT + (append ? "\n\n" + append : ""),
			getAppendSystemPrompt: () => [],
			getPathMetadata: () => new Map(),
			extendResources: () => {},
			reload: async () => {},
		};
	}

	// Use DefaultResourceLoader with filtering for skills/extensions
	const skillNames = new Set(opts.skills || []);
	const extNames = new Set(opts.extensions || []);

	const loader = new DefaultResourceLoader({
		cwd: opts.cwd,
		agentDir: getAgentDir(),
		noThemes: true,
		noPromptTemplates: true,
		skillsOverride: (current) => ({
			skills: hasSkills ? current.skills.filter(s => skillNames.has(s.name)) : [],
			diagnostics: current.diagnostics,
		}),
		extensionsOverride: hasExtensions
			? (current) => ({
				extensions: current.extensions.filter(e => {
					const name = e.name || e.path?.split("/").pop()?.replace(/\.(ts|js)$/, "") || "";
					return extNames.has(name);
				}),
				errors: current.errors,
				runtime: current.runtime,
			})
			: (_current) => ({
				extensions: [],
				errors: [],
				runtime: createExtensionRuntime(),
			}),
		// Sub-agents don't need AGENTS.md — they get the sub-agent system prompt
		agentsFilesOverride: () => ({ agentsFiles: [] }),
		systemPromptOverride: () => SUB_AGENT_SYSTEM_PROMPT + (opts.systemPrompt ? "\n\n" + opts.systemPrompt : ""),
	});
	await loader.reload();
	return loader;
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
	params: { task: string; model?: string; tools?: string; systemPrompt?: string; cwd?: string; skills?: string; extensions?: string },
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

	// Local abort controller — cascades to all children via childSignal
	const localAbort = new AbortController();
	const childSignal = localAbort.signal;

	// If parent signal fires, abort this level (which cascades down)
	let parentAbortHandler: (() => void) | null = null;
	if (signal) {
		parentAbortHandler = () => localAbort.abort();
		if (signal.aborted) localAbort.abort();
		else signal.addEventListener("abort", parentAbortHandler, { once: true });
	}

	let session: any = null;
	let progressInterval: ReturnType<typeof setInterval> | null = null;

	try {
		const authStorage = AuthStorage.create();
		const modelRegistry = new ModelRegistry(authStorage);
		const childTools = createChildTools(id, parentCtx, childSignal);
		const resourceLoader = await createSubAgentResourceLoader({
			cwd,
			systemPrompt: params.systemPrompt,
			skills: params.skills?.split(",").map(s => s.trim()).filter(Boolean),
			extensions: params.extensions?.split(",").map(s => s.trim()).filter(Boolean),
		});

		const created = await createAgentSession({
			cwd, model: model || undefined, thinkingLevel: "off",
			authStorage, modelRegistry,
			resourceLoader,
			tools: resolveTools(params.tools, cwd),
			customTools: childTools,
			sessionManager: SessionManager.inMemory(),
			settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
		});
		session = created.session;

		agent.abortSession = async () => { localAbort.abort(); try { await session.abort(); } catch {} };

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

		if (childSignal.aborted) session.abort();
		else childSignal.addEventListener("abort", () => { try { session.abort(); } catch {} }, { once: true });

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
		// Abort all children, clean up resources
		localAbort.abort();
		if (progressInterval) clearInterval(progressInterval);
		if (session) { try { session.dispose(); } catch {} }
		// Remove parent listener to avoid leak
		if (signal && parentAbortHandler) {
			signal.removeEventListener("abort", parentAbortHandler);
		}
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

/** Combine two AbortSignals — fires when either fires */
function mergeSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal | undefined {
	if (!a && !b) return undefined;
	if (!a) return b;
	if (!b) return a;
	const controller = new AbortController();
	const abort = () => controller.abort();
	if (a.aborted || b.aborted) { controller.abort(); return controller.signal; }
	a.addEventListener("abort", abort, { once: true });
	b.addEventListener("abort", abort, { once: true });
	return controller.signal;
}

function createChildTools(parentId: string, parentCtx: ExtensionContext, parentSignal: AbortSignal): ToolDefinition[] {
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
				skills: Type.Optional(Type.String({ description: "Comma-separated skill names to load (e.g., autonomous-dev,code-maat)" })),
				extensions: Type.Optional(Type.String({ description: "Comma-separated extension names to load" })),
			}),
			async execute(_id, params, signal, onUpdate, _ctx) {
				return formatAgentResult(await runAgent(parentId, parentCtx, params, mergeSignals(signal, parentSignal), onUpdate));
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
				skills: Type.Optional(Type.String({ description: "Comma-separated skill names to load (e.g., autonomous-dev,code-maat)" })),
				extensions: Type.Optional(Type.String({ description: "Comma-separated extension names to load" })),
				}), { description: "Array of agent specs to run in parallel" }),
			}),
			async execute(_id, params, signal, onUpdate, _ctx) {
				const merged = mergeSignals(signal, parentSignal);
				const results = await Promise.all(
					params.agents.map((spec: any) => runAgent(parentId, parentCtx, spec, merged, onUpdate))
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
			skills: Type.Optional(Type.String({ description: "Comma-separated skill names to load (e.g., autonomous-dev,code-maat)" })),
			extensions: Type.Optional(Type.String({ description: "Comma-separated extension names to load" })),
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
				skills: Type.Optional(Type.String({ description: "Comma-separated skill names to load (e.g., autonomous-dev,code-maat)" })),
				extensions: Type.Optional(Type.String({ description: "Comma-separated extension names to load" })),
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
		setStatusBarWidget();
	});

	pi.on("session_shutdown", async () => {
		stopGlobalRenderTimer();
		await Promise.allSettled(Array.from(agents.values()).map(a => a.abortSession?.()));
		agents.clear();
	});
}
