import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { listRegistrations } from "./registry.js";
import { Ok, Err, fromPromise, match, type Result } from "./result.js";

const WS_PORT_START = Number(process.env.PI_REMOTE_WS_START) || 9001;
const WS_PORT_END = Number(process.env.PI_REMOTE_WS_END) || 9099;

// ── Types ──

export interface WsServer {
	port: number;
	broadcast: (event: unknown) => void;
	onMessage: (handler: (msg: any, ws: WebSocket) => void) => void;
	onConnect: (handler: (ws: WebSocket) => void) => void;
	close: () => void;
}

// ── Pure helpers ──

const usedPorts = (): Set<number> => new Set(listRegistrations().map((r) => r.wsPort));

const tryListen = (port: number): Promise<Result<HttpServer>> =>
	fromPromise(
		new Promise<HttpServer>((resolve, reject) => {
			const server = createServer();
			server.on("error", reject);
			server.listen(port, "0.0.0.0", () => {
				server.removeAllListeners("error");
				resolve(server);
			});
		}),
		`bind port ${port}`
	);

const wrapServer = (httpServer: HttpServer, port: number): WsServer => {
	const wss = new WebSocketServer({ server: httpServer });
	const clients = new Set<WebSocket>();
	let messageHandler: ((msg: any, ws: WebSocket) => void) | null = null;
	let connectHandler: ((ws: WebSocket) => void) | null = null;

	wss.on("connection", (ws) => {
		clients.add(ws);
		connectHandler?.(ws);

		ws.on("message", (data) => {
			const parsed = JSON.parse(data.toString());
			if (parsed) messageHandler?.(parsed, ws);
		});

		ws.on("close", () => clients.delete(ws));
	});

	return {
		port,
		broadcast: (event) => {
			const data = JSON.stringify(event);
			clients.forEach((client) => {
				if (client.readyState === WebSocket.OPEN) client.send(data);
			});
		},
		onMessage: (handler) => {
			messageHandler = handler;
		},
		onConnect: (handler) => {
			connectHandler = handler;
		},
		close: () => {
			clients.forEach((c) => c.close());
			clients.clear();
			wss.close();
			httpServer.close();
		},
	};
};

// ── Main ──

export const startWsServer = async (): Promise<Result<WsServer>> => {
	const taken = usedPorts();

	for (let port = WS_PORT_START; port <= WS_PORT_END; port++) {
		if (taken.has(port)) continue;

		const bound = await tryListen(port);
		if (bound._tag === "Ok") return Ok(wrapServer(bound.value, port));
		// Port busy, try next one
	}

	return Err(`no free port in range ${WS_PORT_START}–${WS_PORT_END}`);
};
