/**
 * Web Search Extension — search the web via a local SearXNG instance
 *
 * Tools:
 *   web_search — search the web, returns structured results
 *
 * SearXNG is spun up via docker compose on first call,
 * kept alive during active use, torn down after 60s idle.
 *
 * Uses Effect for retry, error handling, and container lifecycle.
 * Docker operations are wrapped in a service. Multiple sub-agents
 * can call web_search in parallel safely.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { Effect, Layer, ManagedRuntime, Schedule, Schema, ServiceMap } from "effect";
import { execSync, spawn } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Config ───────────────────────────────────────────────────────────────────

const SEARXNG_URL = "http://localhost:8888";
const IDLE_TIMEOUT_MS = 60_000;
const CONTAINER_NAME = "pi-searxng";
const EXT_DIR = dirname(fileURLToPath(import.meta.url));

// ── Errors ───────────────────────────────────────────────────────────────────

export class DockerNotInstalled extends Schema.TaggedErrorClass<DockerNotInstalled>()(
	"DockerNotInstalled",
	{ message: Schema.String },
) {}

export class DockerNotRunning extends Schema.TaggedErrorClass<DockerNotRunning>()(
	"DockerNotRunning",
	{ message: Schema.String },
) {}

export class ContainerStartFailed extends Schema.TaggedErrorClass<ContainerStartFailed>()(
	"ContainerStartFailed",
	{ message: Schema.String },
) {}

export class SearxngNotReady extends Schema.TaggedErrorClass<SearxngNotReady>()(
	"SearxngNotReady",
	{ message: Schema.String },
) {}

export class SearchFailed extends Schema.TaggedErrorClass<SearchFailed>()(
	"SearchFailed",
	{ message: Schema.String },
) {}

// ── Docker Service ───────────────────────────────────────────────────────────

export class Docker extends ServiceMap.Service<Docker, {
	readonly isInstalled: Effect.Effect<boolean>
	readonly isRunning: Effect.Effect<boolean>
	isContainerRunning(name: string): Effect.Effect<boolean>
	isContainerExists(name: string): Effect.Effect<boolean>
	removeContainer(name: string): Effect.Effect<void>
	composeUp(cwd: string): Effect.Effect<void, ContainerStartFailed>
	composeDown(cwd: string): Effect.Effect<void>
}>()("web-search/Docker") {
	static readonly layer = Layer.succeed(
		Docker,
		Docker.of({
			isInstalled: Effect.try({
				try: () => {
					execSync("which docker", { stdio: "ignore", timeout: 5_000 });
					return true;
				},
				catch: () => false,
			}).pipe(Effect.orElseSucceed(() => false)),

			isRunning: Effect.try({
				try: () => {
					execSync("docker info", { stdio: "ignore", timeout: 10_000 });
					return true;
				},
				catch: () => false,
			}).pipe(Effect.orElseSucceed(() => false)),

			isContainerRunning(name: string) {
				return Effect.try({
					try: () => {
						const out = execSync(
							`docker ps --filter name=^${name}$ --format "{{.Names}}"`,
							{ timeout: 5_000, encoding: "utf-8" },
						);
						return out.trim() === name;
					},
					catch: () => false,
				}).pipe(Effect.orElseSucceed(() => false));
			},

			isContainerExists(name: string) {
				return Effect.try({
					try: () => {
						const out = execSync(
							`docker ps -a --filter name=^${name}$ --format "{{.Names}}"`,
							{ timeout: 5_000, encoding: "utf-8" },
						);
						return out.trim() === name;
					},
					catch: () => false,
				}).pipe(Effect.orElseSucceed(() => false));
			},

			removeContainer(name: string) {
				return Effect.try({
					try: () => {
						execSync(`docker rm -f ${name}`, { stdio: "ignore", timeout: 10_000 });
					},
					catch: () => undefined,
				}).pipe(Effect.ignore);
			},

			composeUp(cwd: string) {
				return Effect.tryPromise({
					async try() {
						return new Promise<void>((resolve, reject) => {
							const proc = spawn("docker", ["compose", "up", "-d"], {
								cwd,
								stdio: "ignore",
							});
							proc.on("close", (code) => {
								if (code === 0) resolve();
								else reject(new Error(`exit ${code}`));
							});
							proc.on("error", reject);
						});
					},
					catch: (cause) =>
						new ContainerStartFailed({
							message: `docker compose up failed: ${cause}`,
						}),
				});
			},

			composeDown(cwd: string) {
				return Effect.try({
					try: () => {
						execSync("docker compose down", { cwd, stdio: "ignore", timeout: 15_000 });
					},
					catch: () => undefined,
				}).pipe(Effect.ignore);
			},
		}),
	);
}

// ── SearXNG Engine Service ───────────────────────────────────────────────────

interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	engine: string;
}

export class SearxngEngine extends ServiceMap.Service<SearxngEngine, {
	ensureReady(): Effect.Effect<void, DockerNotInstalled | DockerNotRunning | ContainerStartFailed | SearxngNotReady>
	search(query: string, count: number, categories?: string): Effect.Effect<SearchResult[], SearchFailed>
	shutdown(): Effect.Effect<void>
}>()("web-search/SearxngEngine") {
	static readonly layer = Layer.effect(
		SearxngEngine,
		Effect.gen(function* () {
			const docker = yield* Docker;

			// ── Shared state ─────────────────────────────────────────────
			let idleTimer: ReturnType<typeof setTimeout> | null = null;
			let containerReady = false;
			let startPromise: Promise<void> | null = null;

			function clearIdleTimer() {
				if (idleTimer) {
					clearTimeout(idleTimer);
					idleTimer = null;
				}
			}
			function resetIdleTimer() {
				clearIdleTimer();
				idleTimer = setTimeout(() => {
					shutdownSync();
				}, IDLE_TIMEOUT_MS);
			}
			function shutdownSync() {
				clearIdleTimer();
				containerReady = false;
				startPromise = null;
				try {
					execSync("docker compose down", { cwd: EXT_DIR, stdio: "ignore", timeout: 15_000 });
				} catch {
					try {
						execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: "ignore", timeout: 10_000 });
					} catch { /* best-effort */ }
				}
			}

			// ── Health check ─────────────────────────────────────────────

			const healthCheck = Effect.tryPromise({
				async try() {
					const res = await fetch(`${SEARXNG_URL}/search?q=ping&format=json`);
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					return true as const;
				},
				catch: () => new SearxngNotReady({ message: "SearXNG not responding" }),
			});

			const waitForHealthy = healthCheck.pipe(
				Effect.retry(
					Schedule.spaced("500 millis").pipe(
						Schedule.both(Schedule.recurs(90)), // 45s max
					),
				),
			);

			// ── Start container logic ────────────────────────────────────

			const startContainerEffect = Effect.gen(function* () {
				// Pre-flight
				const installed = yield* docker.isInstalled;
				if (!installed) {
					return yield* new DockerNotInstalled({
						message: [
							"Docker is not installed.",
							"",
							"Install via one of:",
							"  • OrbStack (recommended for macOS): https://orbstack.dev",
							"  • Docker Desktop: https://www.docker.com/products/docker-desktop",
							"  • Homebrew: brew install --cask orbstack",
						].join("\n"),
					});
				}
				const running = yield* docker.isRunning;
				if (!running) {
					return yield* new DockerNotRunning({
						message: [
							"Docker daemon is not running.",
							"",
							"Start it with one of:",
							"  • OrbStack: open -a OrbStack",
							"  • Docker Desktop: open -a Docker",
							"",
							"Then wait a few seconds and retry.",
						].join("\n"),
					});
				}

				// Already healthy?
				const alreadyUp = yield* healthCheck.pipe(Effect.orElseSucceed(() => false));
				if (alreadyUp === true) {
					containerReady = true;
					return;
				}

				// Container running? Just wait for health.
				const isUp = yield* docker.isContainerRunning(CONTAINER_NAME);
				if (isUp) {
					yield* waitForHealthy;
					containerReady = true;
					return;
				}

				// Clean up stopped container
				const exists = yield* docker.isContainerExists(CONTAINER_NAME);
				if (exists) {
					yield* docker.removeContainer(CONTAINER_NAME);
				}

				// Compose up — if it fails, another process may be starting it
				yield* docker.composeUp(EXT_DIR).pipe(
					Effect.catchTag("ContainerStartFailed", () =>
						Effect.gen(function* () {
							yield* Effect.sleep("3 seconds");
							const nowRunning = yield* docker.isContainerRunning(CONTAINER_NAME);
							if (!nowRunning) {
								return yield* new ContainerStartFailed({
									message: "docker compose up failed and no container is running.",
								});
							}
						}),
					),
				);

				// Wait for SearXNG
				yield* waitForHealthy;
				containerReady = true;
			});

			// ── Search logic ─────────────────────────────────────────────

			function doSearch(query: string, count: number, categories?: string) {
				const params = new URLSearchParams({
					q: query,
					format: "json",
					...(categories && { categories }),
				});
				return Effect.tryPromise({
					async try() {
						const res = await fetch(`${SEARXNG_URL}/search?${params}`);
						if (!res.ok) {
							const body = await res.text().catch(() => "");
							throw new Error(`HTTP ${res.status}: ${body}`);
						}
						const data = (await res.json()) as {
							results?: Array<{
								title?: string;
								url?: string;
								content?: string;
								engine?: string;
							}>;
						};
						return (data.results || []).slice(0, count).map((r) => ({
							title: r.title || "",
							url: r.url || "",
							snippet: r.content || "",
							engine: r.engine || "",
						}));
					},
					catch: (cause) => new SearchFailed({ message: `${cause}` }),
				});
			}

			// ── Service implementation ───────────────────────────────────

			return SearxngEngine.of({
				ensureReady() {
					return Effect.gen(function* () {
						// Fast path: already healthy
						if (containerReady) {
							const healthy = yield* healthCheck.pipe(Effect.orElseSucceed(() => false));
							if (healthy === true) {
								resetIdleTimer();
								return;
							}
							containerReady = false;
							startPromise = null;
						}

						// Piggyback on existing start
						if (startPromise) {
							yield* Effect.tryPromise({
								try: () => startPromise!,
								catch: (cause) => new ContainerStartFailed({ message: `${cause}` }),
							});
							resetIdleTimer();
							return;
						}

						// Start fresh
						const promise = Effect.runPromise(startContainerEffect).then(
							() => resetIdleTimer(),
							(err) => {
								startPromise = null;
								containerReady = false;
								throw err;
							},
						);
						startPromise = promise;
						yield* Effect.tryPromise({
							try: () => promise,
							catch: (cause) => new ContainerStartFailed({ message: `${cause}` }),
						});
					});
				},

				search(query: string, count: number, categories?: string) {
					return doSearch(query, count, categories).pipe(
						// If search fails, check if container died and restart
						Effect.catchTag("SearchFailed", (err) =>
							Effect.gen(function* () {
								const healthy = yield* healthCheck.pipe(Effect.orElseSucceed(() => false));
								if (healthy !== true) {
									containerReady = false;
									startPromise = null;
									yield* startContainerEffect;
									return yield* doSearch(query, count, categories);
								}
								return yield* err;
							}),
						),
						// Retry transient failures: exponential backoff, max 5 retries, capped at 3s
						Effect.retry(
							Schedule.exponential("250 millis").pipe(
								Schedule.either(Schedule.spaced("3 seconds")),
								Schedule.both(Schedule.recurs(5)),
							),
						),
					);
				},

				shutdown() {
					return Effect.gen(function* () {
						clearIdleTimer();
						containerReady = false;
						startPromise = null;
						yield* docker.composeDown(EXT_DIR);
						yield* docker.removeContainer(CONTAINER_NAME);
					});
				},
			});
		}),
	).pipe(Layer.provide(Docker.layer));
}

// ── Runtime ──────────────────────────────────────────────────────────────────

const appLayer = SearxngEngine.layer;
const runtime = ManagedRuntime.make(appLayer);

// ── Extension ────────────────────────────────────────────────────────────────

export default function webSearchExtension(pi: ExtensionAPI) {
	pi.on("session_shutdown", async () => {
		try {
			await runtime.runPromise(
				SearxngEngine.use((engine) => engine.shutdown()),
			);
		} catch {
			// never let shutdown fail
		}
		try {
			await runtime.dispose();
		} catch {
			// best-effort
		}
	});

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web using a local SearXNG instance. Returns structured results with title, URL, and snippet. Use this to research topics, find documentation, discover tools, and gather information.",
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			count: Type.Optional(
				Type.Number({ description: "Number of results (default 10, max 30)" }),
			),
			categories: Type.Optional(
				Type.String({
					description: "Comma-separated categories: general, science, it, files, images, news",
				}),
			),
		}),

		async execute(_toolCallId, params, signal, onUpdate) {
			const count = Math.min(params.count || 10, 30);

			try {
				onUpdate?.({ content: [{ type: "text", text: "Starting SearXNG..." }] });
				await runtime.runPromise(
					SearxngEngine.use((engine) => engine.ensureReady()),
				);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Failed to start search engine.\n\n${msg}` }],
					details: { error: true },
					isError: true,
				};
			}

			if (signal?.aborted) {
				return {
					content: [{ type: "text", text: "Search cancelled." }],
					details: { cancelled: true },
				};
			}

			try {
				onUpdate?.({ content: [{ type: "text", text: `Searching for "${params.query}"...` }] });
				const results = await runtime.runPromise(
					SearxngEngine.use((engine) => engine.search(params.query, count, params.categories)),
				);

				if (results.length === 0) {
					return {
						content: [{ type: "text", text: `No results found for "${params.query}".` }],
						details: { results: [] },
					};
				}

				const formatted = results
					.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`)
					.join("\n\n");

				return {
					content: [
						{ type: "text", text: `Found ${results.length} results for "${params.query}":\n\n${formatted}` },
					],
					details: { results },
				};
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: "text", text: `Search failed after retries: ${msg}` }],
					details: { error: true },
					isError: true,
				};
			}
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("web_search "));
			text += theme.fg("muted", `"${args.query}"`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				const progress = result.content?.[0]?.type === "text" ? result.content[0].text : "Searching...";
				return new Text(theme.fg("warning", progress), 0, 0);
			}

			const text = result.content?.[0]?.type === "text" ? result.content[0].text : "No results";

			if (result.isError) {
				return new Text(theme.fg("error", text), 0, 0);
			}

			if (!expanded) {
				const firstLine = text.split("\n")[0] || "Search complete";
				return new Text(firstLine, 0, 0);
			}
			return new Text(text, 0, 0);
		},
	});
}
