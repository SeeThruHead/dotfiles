import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { hostname } from "node:os";
import { WebSocket } from "ws";
import { match } from "./result.js";
import {
	cleanStaleRegistrations,
	writeRegistration,
	updateRegistration,
	removeRegistration,
	type SessionRegistration,
} from "./registry.js";
import { startWsServer, type WsServer } from "./ws-server.js";
import { tryBecomeHub, startHubElectionLoop, type Hub } from "./hub.js";

export default function (pi: ExtensionAPI) {
	let wsServer: WsServer | null = null;
	let hub: Hub | null = null;
	let electionTimer: NodeJS.Timeout | null = null;
	let sessionId = "";
	let streaming = false;

	// ── Session lifecycle ──

	pi.on("session_start", async (_event, ctx) => {
		cleanStaleRegistrations();

		// Start per-session WebSocket server
		match(await startWsServer(), {
			Ok: (server) => {
				wsServer = server;
			},
			Err: (e) => {
				ctx.ui.notify(`pi-remote: ${e}`, "error");
				return;
			},
		});

		if (!wsServer) return;

		// Register this session
		sessionId = `pid-${process.pid}`;
		const model = ctx.model ? `${ctx.model.provider}/${ctx.model.name}` : "unknown";

		writeRegistration(sessionId, {
			pid: process.pid,
			wsPort: wsServer.port,
			cwd: ctx.cwd,
			sessionName: pi.getSessionName() || "unnamed",
			sessionId,
			model,
			startedAt: new Date().toISOString(),
			isStreaming: false,
		});

		// Wire up WebSocket handlers
		wsServer.onConnect((ws) => {
			ws.send(JSON.stringify({
				type: "metadata",
				sessionId,
				cwd: ctx.cwd,
				model,
				sessionName: pi.getSessionName() || "unnamed",
				isStreaming: streaming,
			}));
		});

		const messageHandlers: Record<string, (msg: any, ws: any) => void> = {
			prompt: (msg) => {
				if (ctx.isIdle()) {
					pi.sendUserMessage(msg.text);
				} else {
					pi.sendUserMessage(msg.text, {
						deliverAs: msg.deliverAs === "steer" ? "steer" : "followUp",
					});
				}
			},
			abort: () => ctx.abort(),
			get_history: (_msg, ws) => {
				const entries = ctx.sessionManager.getEntries();
				ws.send(JSON.stringify({ type: "history", sessionId, entries }));
			},
		};

		wsServer.onMessage((msg, ws) => {
			const handler = messageHandlers[msg.type];
			if (handler) handler(msg, ws);
		});

		// Hub election
		match(await tryBecomeHub(), {
			Ok: (maybeHub) => {
				hub = maybeHub;
			},
			Err: (e) => {
				ctx.ui.notify(`pi-remote hub: ${e}`, "warning");
			},
		});

		electionTimer = startHubElectionLoop(
			(newHub) => {
				hub = newHub;
				const host = hostname();
				const theme = ctx.ui.theme;
				ctx.ui.setWidget(
					"pi-remote",
					[theme.fg("success", "●") + theme.fg("dim", ` pi-remote: http://${host}:${newHub.port}`)],
					{ placement: "belowEditor" }
				);
			},
			() => hub !== null
		);

		// Show status as its own line below the editor
		const host = hostname();
		const theme = ctx.ui.theme;
		const statusUrl = hub
			? `http://${host}:${hub.port}`
			: `ws://${host}:${wsServer.port}`;
		const statusIcon = hub ? theme.fg("success", "●") : theme.fg("dim", "●");
		ctx.ui.setWidget("pi-remote", [statusIcon + theme.fg("dim", ` pi-remote: ${statusUrl}`)], { placement: "belowEditor" });
	});

	// ── Event forwarding to web clients ──

	pi.on("agent_start", async () => {
		streaming = true;
		updateRegistration(sessionId, { isStreaming: true });
		wsServer?.broadcast({ type: "agent_start" });
	});

	pi.on("agent_end", async () => {
		streaming = false;
		updateRegistration(sessionId, { isStreaming: false });
		wsServer?.broadcast({ type: "agent_end" });
	});

	pi.on("turn_start", async () => {
		wsServer?.broadcast({ type: "turn_start" });
	});

	pi.on("turn_end", async () => {
		wsServer?.broadcast({ type: "turn_end" });
	});

	pi.on("message_start", async (event) => {
		wsServer?.broadcast({ type: "message_start", message: event.message });
	});

	pi.on("message_update", async (event) => {
		wsServer?.broadcast({
			type: "message_update",
			message: event.message,
			assistantMessageEvent: event.assistantMessageEvent,
		});
	});

	pi.on("message_end", async (event) => {
		wsServer?.broadcast({ type: "message_end", message: event.message });
	});

	pi.on("tool_execution_start", async (event) => {
		wsServer?.broadcast({
			type: "tool_execution_start",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			args: event.args,
		});
	});

	pi.on("tool_execution_update", async (event) => {
		wsServer?.broadcast({
			type: "tool_execution_update",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			partialResult: event.partialResult,
		});
	});

	pi.on("tool_execution_end", async (event) => {
		wsServer?.broadcast({
			type: "tool_execution_end",
			toolCallId: event.toolCallId,
			toolName: event.toolName,
			result: event.result,
			isError: event.isError,
		});
	});

	pi.on("input", async (event) => {
		wsServer?.broadcast({ type: "user_input", text: event.text, source: event.source });
		return { action: "continue" as const };
	});

	pi.on("model_select", async (event) => {
		const model = `${event.model.provider}/${event.model.name}`;
		updateRegistration(sessionId, { model });
		wsServer?.broadcast({ type: "model_change", model });
	});

	// ── Cleanup ──

	pi.on("session_shutdown", async () => {
		if (electionTimer) clearInterval(electionTimer);
		hub?.close();
		wsServer?.close();
		removeRegistration(sessionId);
	});
}
