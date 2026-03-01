import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { homedir } from "node:os";
import { readHub, writeHub, removeHub, listRegistrations, type HubRegistration } from "./registry.js";
import { Ok, Err, fromPromise, fromTry, match, type Result } from "./result.js";

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

	if (serveStatic(url, res)) return;

	// Fallback: serve index.html for SPA routing
	if (serveStatic("/", res)) return;

	res.writeHead(404);
	res.end("Not found");
};

// ── Server lifecycle ──

const tryListenHub = (): Promise<Result<Server>> =>
	fromPromise(
		new Promise<Server>((resolve, reject) => {
			const server = createServer(handleRequest);
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
