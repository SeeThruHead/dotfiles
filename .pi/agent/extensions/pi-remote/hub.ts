import { createServer, type Server, type IncomingMessage } from "node:http";
import { readFileSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import { WebSocket, WebSocketServer } from "ws";
import { readHub, writeHub, removeHub, listRegistrations, type HubRegistration } from "./registry.js";
import { Ok, Err, fromPromise, fromTry, match, type Result } from "./result.js";
import type { Duplex } from "node:stream";

const HUB_PORT = Number(process.env.PI_REMOTE_HUB_PORT) || 9000;
const WEB_DIR = join(homedir(), ".pi", "agent", "extensions", "pi-remote", "web");

// ── Types ──

export interface Hub {
	port: number;
	close: () => void;
}

// ── Static file serving ──

const MIME_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
};

const serveStatic = (path: string, res: any): boolean => {
	const filePath = join(WEB_DIR, path === "/" ? "index.html" : path);

	// Prevent directory traversal
	if (!filePath.startsWith(WEB_DIR)) {
		res.writeHead(403);
		res.end("Forbidden");
		return true;
	}

	return match(fromTry(() => readFileSync(filePath)), {
		Ok: (content) => {
			const mime = MIME_TYPES[extname(filePath)] || "application/octet-stream";
			res.writeHead(200, { "Content-Type": mime, "Cache-Control": "no-cache" });
			res.end(content);
			return true;
		},
		Err: () => false,
	});
};

// ── Request handling ──

const handleRequest = (req: any, res: any): void => {
	const url = req.url || "/";
	const method = req.method || "GET";

	// ── CORS preflight ──
	if (method === "OPTIONS") {
		res.writeHead(204, {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
		});
		res.end();
		return;
	}

	if (url === "/api/sessions") {
		const sessions = listRegistrations();
		const hostname = req.headers.host?.split(":")[0] || "localhost";
		res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
		res.end(JSON.stringify({
			sessions: sessions.map((s) => ({ ...s, isHub: s.pid === process.pid })),
			hubHost: hostname,
		}));
		return;
	}

	// ── SSE: GET /sse/<sessionId> ──
	const sseMatch = url.match(/^\/sse\/(.+)$/);
	if (sseMatch && method === "GET") {
		handleSSE(sseMatch[1], req, res);
		return;
	}

	// ── POST: POST /api/send/<sessionId> ──
	const sendMatch = url.match(/^\/api\/send\/(.+)$/);
	if (sendMatch && method === "POST") {
		handleSend(sendMatch[1], req, res);
		return;
	}

	if (serveStatic(url, res)) return;

	// Fallback: serve index.html for SPA routing
	if (serveStatic("/", res)) return;

	res.writeHead(404);
	res.end("Not found");
};

// ── SSE endpoint ──
// Opens an SSE stream to the client and proxies messages from the session's WS.

const sseConnections = new Map<string, Set<{ res: any; upstream: WebSocket }>>();

const handleSSE = (sessionId: string, _req: any, res: any): void => {
	const sessions = listRegistrations();
	const session = sessions.find((s) => s.id === sessionId);

	if (!session) {
		res.writeHead(404, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
		res.end("session not found");
		return;
	}

	// Connect upstream to the session's WS
	const upstream = new WebSocket(`ws://127.0.0.1:${session.wsPort}`);

	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		"Connection": "keep-alive",
		"Access-Control-Allow-Origin": "*",
		"X-Accel-Buffering": "no",
	});
	res.write(":\n\n"); // SSE comment to flush headers

	const conn = { res, upstream };
	if (!sseConnections.has(sessionId)) sseConnections.set(sessionId, new Set());
	sseConnections.get(sessionId)!.add(conn);

	const sendSSE = (data: string) => {
		try {
			res.write("data: " + data + "\n\n");
		} catch {}
	};

	const upstreamTimeout = setTimeout(() => {
		sendSSE(JSON.stringify({ type: "error", message: "upstream timeout" }));
		cleanup();
	}, 5000);

	upstream.on("open", () => {
		clearTimeout(upstreamTimeout);
		sendSSE(JSON.stringify({ type: "_sse_connected" }));
	});

	upstream.on("message", (data, isBinary) => {
		const msg = isBinary ? data : data.toString();
		sendSSE(typeof msg === "string" ? msg : msg.toString());
	});

	const cleanup = () => {
		clearTimeout(upstreamTimeout);
		upstream.close();
		sseConnections.get(sessionId)?.delete(conn);
		try { res.end(); } catch {}
	};

	upstream.on("close", () => {
		sendSSE(JSON.stringify({ type: "_sse_disconnected" }));
		cleanup();
	});

	upstream.on("error", (err) => {
		cleanup();
	});

	_req.on("close", () => {
		cleanup();
	});
};

// ── POST send endpoint ──
// Receives JSON from the client and forwards it to the session's WS.

const handleSend = (sessionId: string, req: any, res: any): void => {
	const conns = sseConnections.get(sessionId);
	if (!conns || conns.size === 0) {
		res.writeHead(404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
		res.end(JSON.stringify({ error: "no active SSE connection for session" }));
		return;
	}

	let body = "";
	req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
	req.on("end", () => {
		try {
			// Forward to all upstream WS connections for this session
			for (const conn of conns) {
				if (conn.upstream.readyState === WebSocket.OPEN) {
					conn.upstream.send(body);
				}
			}
			res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
			res.end(JSON.stringify({ ok: true }));
		} catch (err: any) {
			res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
			res.end(JSON.stringify({ error: err.message }));
		}
	});
};

// ── WebSocket proxy ──
// Proxies ws://hub:9000/ws/<sessionId> → ws://localhost:<sessionWsPort>
// so clients only need to reach the hub port.

const setupWsProxy = (server: Server): WebSocketServer => {
	const wss = new WebSocketServer({ noServer: true });

	server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
		const url = req.url || "";
		const wsMatch = url.match(/^\/ws\/(.+)$/);

		if (!wsMatch) {
			socket.destroy();
			return;
		}

		const sessionId = wsMatch[1];
		const sessions = listRegistrations();
		const session = sessions.find((s) => s.id === sessionId);

		if (!session) {
			socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
			socket.destroy();
			return;
		}


		// Upgrade the client IMMEDIATELY so iOS Safari gets its 101 response
		// without waiting for the upstream connection.
		wss.handleUpgrade(req, socket, head, (clientWs) => {

			const bufferedMessages: any[] = [];
			let upstreamReady = false;

			// Buffer client messages until upstream is connected
			clientWs.on("message", (data, isBinary) => {
				const fwd = isBinary ? data : data.toString();
				if (upstreamReady && upstream.readyState === WebSocket.OPEN) {
					upstream.send(fwd);
				} else {
					bufferedMessages.push(fwd);
				}
			});

			const upstream = new WebSocket(`ws://127.0.0.1:${session.wsPort}`);

			const upstreamTimeout = setTimeout(() => {
				upstream.close();
				clientWs.close(1011, "upstream timeout");
			}, 5000);

			upstream.on("open", () => {
				clearTimeout(upstreamTimeout);
				upstreamReady = true;

				// Flush buffered messages
				for (const msg of bufferedMessages) {
					upstream.send(msg);
				}
				bufferedMessages.length = 0;

				// Pipe upstream → client
				upstream.on("message", (data, isBinary) => {
					if (clientWs.readyState === WebSocket.OPEN) {
						clientWs.send(isBinary ? data : data.toString());
					}
				});
			});

			clientWs.on("close", () => {
				clearTimeout(upstreamTimeout);
				upstream.close();
			});
			upstream.on("close", () => clientWs.close());

			clientWs.on("error", () => {
				clearTimeout(upstreamTimeout);
				upstream.close();
			});
			upstream.on("error", (err) => {
				clearTimeout(upstreamTimeout);
				clientWs.close(1011, "upstream error");
			});
		});
	});

	return wss;
};

// ── Server lifecycle ──

const tryListenHub = (): Promise<Result<Server>> =>
	fromPromise(
		new Promise<Server>((resolve, reject) => {
			const server = createServer(handleRequest);
			setupWsProxy(server);
			server.on("error", reject);
			server.listen(HUB_PORT, "0.0.0.0", () => {
				server.removeAllListeners("error");
				resolve(server);
			});
		}),
		`bind hub port ${HUB_PORT}`
	);

const registerAsHub = (server: Server): Hub => {
	writeHub({ pid: process.pid, port: HUB_PORT, startedAt: new Date().toISOString() });
	return {
		port: HUB_PORT,
		close: () => {
			server.close();
			removeHub();
		},
	};
};

// ── Main ──

export const tryBecomeHub = async (): Promise<Result<Hub | null>> => {
	const existing = readHub();
	if (existing) return Ok(null);

	return match(await tryListenHub(), {
		Ok: (server) => Ok(registerAsHub(server)) as Result<Hub | null>,
		Err: (e) => Err(e) as Result<Hub | null>,
	});
};

export const startHubElectionLoop = (
	onBecameHub: (hub: Hub) => void,
	isHub: () => boolean
): NodeJS.Timeout => {
	const interval = Number(process.env.PI_REMOTE_POLL_INTERVAL) || 5000;

	return setInterval(async () => {
		if (isHub()) return;

		match(await tryBecomeHub(), {
			Ok: (hub) => {
				if (hub) onBecameHub(hub);
			},
			Err: () => {},
		});
	}, interval);
};
