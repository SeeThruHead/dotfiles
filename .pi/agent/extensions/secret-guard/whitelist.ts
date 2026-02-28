import type { Whitelist } from "./types.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, basename, join } from "node:path";
import { homedir } from "node:os";

const GLOBAL_PATH = join(homedir(), ".pi", "agent", "secret-guard.json");

const projectPath = (cwd: string) => join(cwd, ".pi", "secret-guard.json");

const emptyWhitelist = (): Whitelist => ({ files: [], commands: [] });

function load(path: string): Whitelist {
  try {
    if (existsSync(path)) return JSON.parse(readFileSync(path, "utf-8"));
  } catch {}
  return emptyWhitelist();
}

function save(path: string, whitelist: Whitelist): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(whitelist, null, 2) + "\n", "utf-8");
}

function merge(cwd: string): Whitelist {
  const global = load(GLOBAL_PATH);
  const project = load(projectPath(cwd));
  return {
    files: [...global.files, ...project.files],
    commands: [...global.commands, ...project.commands],
  };
}

export function isWhitelistedFile(filePath: string, cwd: string): boolean {
  return merge(cwd).files.some(
    (entry) => filePath === entry || filePath.endsWith(entry) || basename(filePath) === entry
  );
}

export function isWhitelistedCommand(command: string, cwd: string): boolean {
  return merge(cwd).commands.some((entry) => command.includes(entry));
}

export function addToWhitelist(
  scope: "project" | "global",
  type: "files" | "commands",
  value: string,
  cwd: string
): boolean {
  const path = scope === "project" ? projectPath(cwd) : GLOBAL_PATH;
  const wl = load(path);
  if (wl[type].includes(value)) return false;
  wl[type].push(value);
  save(path, wl);
  return true;
}

export function clearWhitelist(scope: "project" | "global" | "both", cwd: string): void {
  const empty = emptyWhitelist();
  if (scope !== "global") save(projectPath(cwd), empty);
  if (scope !== "project") save(GLOBAL_PATH, empty);
}

export function getWhitelist(cwd: string): Whitelist {
  return merge(cwd);
}
