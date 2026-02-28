/**
 * Minimal tsserver JSON protocol client.
 *
 * Spawns a tsserver process and communicates via its stdin/stdout JSON protocol.
 * The Effect language service plugin is loaded automatically via tsconfig.json.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { createInterface, type Interface as ReadlineInterface } from "node:readline";

// ── Types matching tsserver protocol ────────────────────

export interface TsDiagnostic {
  start?: { line: number; offset: number };
  end?: { line: number; offset: number };
  text: string;
  code?: number;
  category: string;
  source?: string;
}

export interface TsQuickInfo {
  displayString: string;
  documentation: string;
  tags?: Array<{ name: string; text?: string }>;
}

export interface TsCompletion {
  name: string;
  kind: string;
  sortText?: string;
  insertText?: string;
  replacementSpan?: { start: { line: number; offset: number }; end: { line: number; offset: number } };
}

interface TsResponse {
  seq: number;
  type: string;
  command: string;
  request_seq: number;
  success: boolean;
  body?: any;
  message?: string;
}

interface TsEvent {
  seq: number;
  type: "event";
  event: string;
  body?: any;
}

type TsMessage = TsResponse | TsEvent;

// ── TsServer ────────────────────────────────────────────

export class TsServer {
  private proc: ChildProcess | null = null;
  private seq = 0;
  private pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private rl: ReadlineInterface | null = null;
  private openFiles = new Set<string>();
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  // ── Lifecycle ───────────────────────────────────────

  async start(): Promise<void> {
    const tsserverPath = this.findTsServer();

    this.proc = spawn(process.execPath, [tsserverPath, "--useSyntaxServer", "auto"], {
      cwd: this.projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        TSS_LOG: "",  // suppress verbose logging
      },
    });

    this.proc.on("exit", (code) => {
      for (const [, { reject }] of this.pendingRequests) {
        reject(new Error(`tsserver exited with code ${code}`));
      }
      this.pendingRequests.clear();
    });

    this.rl = createInterface({ input: this.proc.stdout! });
    this.rl.on("line", (line) => this.handleLine(line));

    // Wait for the server to be ready by sending a configure request
    await this.request("configure", {
      hostInfo: "pi-effect-lsp",
      preferences: {
        providePrefixAndSuffixTextForRename: true,
        allowRenameOfImportPath: true,
        includeCompletionsForModuleExports: true,
        includeCompletionsWithSnippetText: false,
        includeAutomaticOptionalChainCompletions: true,
      },
    });
  }

  shutdown(): void {
    if (this.proc) {
      try {
        this.sendCommand("exit", {});
      } catch {}
      this.proc.kill();
      this.proc = null;
    }
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    this.openFiles.clear();
    for (const [, { reject }] of this.pendingRequests) {
      reject(new Error("Server shutting down"));
    }
    this.pendingRequests.clear();
  }

  // ── Public API ──────────────────────────────────────

  async getDiagnostics(filePath: string): Promise<TsDiagnostic[]> {
    await this.ensureFileOpen(filePath);

    // Request all three diagnostic types
    const [semantic, syntactic, suggestion] = await Promise.all([
      this.request("semanticDiagnosticsSync", { file: filePath }),
      this.request("syntacticDiagnosticsSync", { file: filePath }),
      this.request("suggestionDiagnosticsSync", { file: filePath }).catch(() => []),
    ]);

    const all = [
      ...(syntactic || []).map((d: any) => ({ ...d, category: d.category || "error" })),
      ...(semantic || []).map((d: any) => ({ ...d, category: d.category || "error" })),
      ...(suggestion || []).map((d: any) => ({ ...d, category: d.category || "suggestion" })),
    ];

    return all;
  }

  async getQuickInfo(
    filePath: string,
    line: number,
    column: number,
  ): Promise<TsQuickInfo | null> {
    await this.ensureFileOpen(filePath);

    const body = await this.request("quickinfo", {
      file: filePath,
      line,
      offset: column,
    });

    if (!body) return null;

    return {
      displayString: body.displayString || "",
      documentation: body.documentation || "",
      tags: body.tags,
    };
  }

  async getCompletions(
    filePath: string,
    line: number,
    column: number,
    prefix?: string,
  ): Promise<TsCompletion[]> {
    await this.ensureFileOpen(filePath);

    const body = await this.request("completionInfo", {
      file: filePath,
      line,
      offset: column,
      prefix: prefix || "",
      includeExternalModuleExports: true,
      triggerKind: 1, // Invoked
    });

    if (!body?.entries) return [];

    let entries: TsCompletion[] = body.entries.map((e: any) => ({
      name: e.name,
      kind: e.kind,
      sortText: e.sortText,
      insertText: e.insertText,
      replacementSpan: e.replacementSpan,
    }));

    if (prefix) {
      const lower = prefix.toLowerCase();
      entries = entries.filter((e) => e.name.toLowerCase().startsWith(lower));
    }

    return entries;
  }

  // ── File management ─────────────────────────────────

  private async ensureFileOpen(filePath: string): Promise<void> {
    if (this.openFiles.has(filePath)) {
      // Reload to pick up changes
      await this.request("reload", {
        file: filePath,
        tmpfile: filePath,
      });
      return;
    }

    await this.request("open", {
      file: filePath,
      projectRootPath: this.projectRoot,
    });
    this.openFiles.add(filePath);
  }

  // ── tsserver communication ──────────────────────────

  private findTsServer(): string {
    // Look for local tsserver first
    const localPaths = [
      join(this.projectRoot, "node_modules", "typescript", "lib", "tsserver.js"),
      join(this.projectRoot, "node_modules", ".pnpm", "typescript", "lib", "tsserver.js"),
    ];

    for (const p of localPaths) {
      if (existsSync(p)) return p;
    }

    // Fall back to global
    try {
      return require.resolve("typescript/lib/tsserver.js");
    } catch {
      throw new Error(
        "Could not find tsserver. Install TypeScript locally: npm install typescript",
      );
    }
  }

  private sendCommand(command: string, args: Record<string, any>): number {
    if (!this.proc?.stdin?.writable) {
      throw new Error("tsserver not running");
    }

    const seq = ++this.seq;
    const request = JSON.stringify({ seq, type: "request", command, arguments: args });
    this.proc.stdin.write(request + "\n");
    return seq;
  }

  private request(command: string, args: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(seq);
        reject(new Error(`tsserver request '${command}' timed out after 30s`));
      }, 30_000);

      const seq = this.sendCommand(command, args);
      this.pendingRequests.set(seq, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
    });
  }

  private handleLine(line: string): void {
    // tsserver sends a Content-Length header before JSON - skip non-JSON lines
    if (!line.startsWith("{")) return;

    let msg: TsMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }

    if (msg.type === "response") {
      const pending = this.pendingRequests.get(msg.request_seq);
      if (pending) {
        this.pendingRequests.delete(msg.request_seq);
        if (msg.success) {
          pending.resolve(msg.body);
        } else {
          pending.reject(new Error(msg.message || `Request failed: ${msg.command}`));
        }
      }
    }
    // Events (diagnostics pushed, etc.) are ignored for now
  }
}
