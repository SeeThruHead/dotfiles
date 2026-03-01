import { mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Ok, Err, fromTry, match, type Result } from "./result.js";

// ── Types ──

export interface SessionRegistration {
	pid: number;
	wsPort: number;
	cwd: string;
	sessionName: string;
	sessionId: string;
	model: string;
	startedAt: string;
	isStreaming: boolean;
}

export interface HubRegistration {
	pid: number;
	port: number;
	startedAt: string;
}

export type SessionEntry = SessionRegistration & { id: string };

// ── Pure helpers ──

const REMOTE_DIR = join(homedir(), ".pi", "agent", "remote");

const isRegistrationFile = (file: string): boolean =>
	file.endsWith(".json") && !file.startsWith("_") && file !== "config.json";

const isStaleFile = (file: string): boolean =>
	file.endsWith(".json") && file !== "_hub.lock" && file !== "config.json";

const processIsAlive = (pid: number): boolean => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

const parseJsonFile = <T>(path: string): Result<T> =>
	fromTry(() => JSON.parse(readFileSync(path, "utf-8")), `parse ${path}`);

const safeUnlink = (path: string): void => {
	try {
		unlinkSync(path);
	} catch {}
};

// ── IO operations ──

export const ensureRemoteDir = (): string => {
	mkdirSync(REMOTE_DIR, { recursive: true });
	return REMOTE_DIR;
};

export const cleanStaleRegistrations = (): void => {
	const dir = ensureRemoteDir();

	match(fromTry(() => readdirSync(dir)), {
		Ok: (files) =>
			files.filter(isStaleFile).forEach((file) => {
				const filePath = join(dir, file);
				match(parseJsonFile<{ pid: number }>(filePath), {
					Ok: (reg) => {
						if (!processIsAlive(reg.pid)) safeUnlink(filePath);
					},
					Err: () => safeUnlink(filePath),
				});
			}),
		Err: () => {},
	});
};

export const writeRegistration = (sessionId: string, reg: SessionRegistration): Result<void> =>
	fromTry(() => {
		const dir = ensureRemoteDir();
		writeFileSync(join(dir, `${sessionId}.json`), JSON.stringify(reg, null, 2));
	}, "write registration");

export const updateRegistration = (sessionId: string, updates: Partial<SessionRegistration>): Result<void> =>
	fromTry(() => {
		const dir = ensureRemoteDir();
		const filePath = join(dir, `${sessionId}.json`);
		const existing = JSON.parse(readFileSync(filePath, "utf-8"));
		writeFileSync(filePath, JSON.stringify({ ...existing, ...updates }, null, 2));
	}, "update registration");

export const removeRegistration = (sessionId: string): void =>
	safeUnlink(join(ensureRemoteDir(), `${sessionId}.json`));

export const listRegistrations = (): SessionEntry[] =>
	match(fromTry(() => readdirSync(ensureRemoteDir())), {
		Ok: (files) =>
			files.filter(isRegistrationFile).flatMap((file) =>
				match(parseJsonFile<SessionRegistration>(join(ensureRemoteDir(), file)), {
					Ok: (reg) => (processIsAlive(reg.pid) ? [{ ...reg, id: file.replace(".json", "") }] : []),
					Err: () => [],
				})
			),
		Err: () => [],
	});

export const readHub = (): HubRegistration | null => {
	const hubPath = join(ensureRemoteDir(), "_hub.json");
	if (!existsSync(hubPath)) return null;

	return match(parseJsonFile<HubRegistration>(hubPath), {
		Ok: (hub) => {
			if (!processIsAlive(hub.pid)) {
				safeUnlink(hubPath);
				return null;
			}
			return hub;
		},
		Err: () => {
			safeUnlink(hubPath);
			return null;
		},
	});
};

export const writeHub = (hub: HubRegistration): Result<void> =>
	fromTry(() => {
		writeFileSync(join(ensureRemoteDir(), "_hub.json"), JSON.stringify(hub, null, 2));
	}, "write hub");

export const removeHub = (): void => safeUnlink(join(ensureRemoteDir(), "_hub.json"));
