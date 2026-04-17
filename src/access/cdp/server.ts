import { writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import WebSocket from "ws";
import { discoverChromeDebuggingTarget, getChromeWebSocketUrl } from "./chrome.js";
import type {
	AttachedToTargetParams,
	AttachToTargetResult,
	CaptureScreenshotResult,
	CDPCommandResponse,
	CDPCommandResult,
	CDPOutgoingMessage,
	CreateTargetResult,
	EndpointQuery,
	FetchRequestPausedParams,
	GetDocumentResult,
	GetTargetsResult,
	JsonObject,
	PageInfo,
	PendingCommand,
	ProxyHealthResponse,
	QuerySelectorResult,
	RuntimeEvaluateResult,
	SetFilesRequestBody,
} from "./types.js";

const DEFAULT_PROXY_PORT = 3456;
const COMMAND_TIMEOUT_MS = 30000;
const LOAD_TIMEOUT_MS = 15000;
const PORT_CHECK_TIMEOUT_MS = 2000;

class ClientError extends Error {}

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function isJsonObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null;
}

function isSetFilesRequestBody(value: unknown): value is SetFilesRequestBody {
	return (
		isJsonObject(value) &&
		typeof value.selector === "string" &&
		Array.isArray(value.files) &&
		value.files.every((file) => typeof file === "string")
	);
}

function rawDataToString(data: WebSocket.RawData): string {
	if (typeof data === "string") {
		return data;
	}

	if (Buffer.isBuffer(data)) {
		return data.toString("utf8");
	}

	if (Array.isArray(data)) {
		return Buffer.concat(data).toString("utf8");
	}

	return Buffer.from(data).toString("utf8");
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "application/json; charset=utf-8");
	response.end(JSON.stringify(payload));
}

function parsePort(value: string | undefined, fallback: number): number {
	if (!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);
	return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : fallback;
}

function requireQueryValue(value: string | undefined, name: string): string {
	if (!value) {
		throw new ClientError(`Missing required query parameter: ${name}`);
	}

	return value;
}

function requireRequestBody(body: string, message: string): string {
	if (body.trim().length === 0) {
		throw new ClientError(message);
	}

	return body;
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

async function readBody(request: IncomingMessage): Promise<string> {
	let body = "";
	for await (const chunk of request) {
		body += typeof chunk === "string" ? chunk : chunk.toString("utf8");
	}
	return body;
}

async function checkPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const probe = createServer();
		const finish = (result: boolean) => {
			probe.removeAllListeners();
			resolve(result);
		};

		probe.once("error", () => finish(false));
		probe.once("listening", () => {
			probe.close(() => finish(true));
		});
		probe.listen(port, "127.0.0.1");
	});
}

async function probeExistingProxyHealth(port: number): Promise<ProxyHealthResponse | null> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/health`, {
			signal: AbortSignal.timeout(PORT_CHECK_TIMEOUT_MS),
		});

		if (!response.ok) {
			return null;
		}

		const raw = await response.text();
		const parsed = JSON.parse(raw) as unknown;
		if (!isJsonObject(parsed)) {
			return null;
		}

		if (
			parsed.status === "ok" &&
			typeof parsed.connected === "boolean" &&
			typeof parsed.sessions === "number" &&
			(typeof parsed.chromePort === "number" || parsed.chromePort === null)
		) {
			return {
				status: "ok",
				connected: parsed.connected,
				sessions: parsed.sessions,
				chromePort: parsed.chromePort,
			};
		}

		return null;
	} catch {
		return null;
	}
}

function getChromeUnavailableReason(): string {
	return 'Chrome is not running with remote debugging enabled. Open chrome://inspect/#remote-debugging and enable "Allow remote debugging for this browser instance".';
}

function isExecutedDirectly(): boolean {
	const currentFile = fileURLToPath(import.meta.url);
	const entryFile = process.argv[1];
	return entryFile !== undefined && currentFile === entryFile;
}

function createEndpointDescriptions(): Record<string, string> {
	return {
		"/health": "GET - proxy status",
		"/targets": "GET - list open page targets",
		"/new?url=": "GET - create a new background tab and wait for load",
		"/close?target=": "GET - close a target",
		"/navigate?target=&url=": "GET - navigate an existing target",
		"/back?target=": "GET - navigate backward in history",
		"/info?target=": "GET - current page title, URL, and readiness",
		"/eval?target=": "POST body=JavaScript expression",
		"/click?target=": "POST body=CSS selector",
		"/clickAt?target=": "POST body=CSS selector for browser-level click",
		"/setFiles?target=": 'POST body={"selector":"...","files":["..."]}',
		"/scroll?target=&y=&direction=": "GET - scroll the page",
		"/screenshot?target=&file=": "GET - capture a screenshot",
	};
}

/**
 * Starts the CDP HTTP bridge on the requested port without auto-running on import.
 */
export async function startServer(port: number, logFile: string | null): Promise<Server | null> {
	let socket: WebSocket | null = null;
	let nextCommandId = 0;
	let connectingPromise: Promise<void> | null = null;
	let chromeConnection = null as Awaited<ReturnType<typeof discoverChromeDebuggingTarget>>;

	const pending = new Map<number, PendingCommand>();
	const sessions = new Map<string, string>();
	const guardedSessions = new Set<string>();

	function isSocketOpen(value: WebSocket | null): value is WebSocket {
		return value !== null && value.readyState === WebSocket.OPEN;
	}

	function clearPendingCommands(error: Error): void {
		for (const [id, command] of pending) {
			clearTimeout(command.timer);
			command.reject(error);
			pending.delete(id);
		}
	}

	async function connect(): Promise<void> {
		if (isSocketOpen(socket)) {
			return;
		}

		if (connectingPromise !== null) {
			return connectingPromise;
		}

		connectingPromise = (async () => {
			chromeConnection ??= await discoverChromeDebuggingTarget();
			if (chromeConnection === null) {
				throw new Error(getChromeUnavailableReason());
			}

			const chromeSocket = new WebSocket(getChromeWebSocketUrl(chromeConnection));
			socket = chromeSocket;

			await new Promise<void>((resolve, reject) => {
				let settled = false;

				const rejectOnce = (error: unknown) => {
					if (settled) {
						return;
					}

					settled = true;
					socket = null;
					chromeConnection = null;
					reject(error instanceof Error ? error : new Error(getErrorMessage(error)));
				};

				chromeSocket.once("open", () => {
					settled = true;
					console.log(`[CDP Proxy] Connected to Chrome on port ${chromeConnection?.port}.`);
					resolve();
				});

				chromeSocket.on("message", (data) => {
					try {
						const message = JSON.parse(rawDataToString(data)) as CDPCommandResponse;

						if (message.method === "Target.attachedToTarget") {
							const params = message.params as AttachedToTargetParams | undefined;
							if (params?.sessionId && params.targetInfo?.targetId) {
								sessions.set(params.targetInfo.targetId, params.sessionId);
							}
						}

						if (message.method === "Fetch.requestPaused") {
							const params = message.params as FetchRequestPausedParams | undefined;
							if (params?.requestId && params.sessionId) {
								void sendCDP(
									"Fetch.failRequest",
									{ requestId: params.requestId, errorReason: "ConnectionRefused" },
									params.sessionId,
								).catch(() => {});
							}
						}

						if (typeof message.id === "number") {
							const command = pending.get(message.id);
							if (command) {
								clearTimeout(command.timer);
								pending.delete(message.id);

								if (message.error?.message) {
									command.reject(new Error(message.error.message));
								} else {
									command.resolve(message);
								}
							}
						}
					} catch (error) {
						console.error(`[CDP Proxy] Failed to parse Chrome message: ${getErrorMessage(error)}`);
					}
				});

				chromeSocket.on("close", () => {
					const wasConnecting = !settled;
					socket = null;
					chromeConnection = null;
					sessions.clear();
					guardedSessions.clear();
					clearPendingCommands(new Error("Chrome WebSocket connection closed."));
					console.log("[CDP Proxy] Chrome connection closed.");

					if (wasConnecting) {
						rejectOnce(new Error("Chrome WebSocket connection closed before it became ready."));
					}
				});

				chromeSocket.on("error", (error) => {
					console.error(`[CDP Proxy] Chrome connection error: ${error.message}`);
					if (!settled) {
						rejectOnce(error);
					}
				});
			});
		})().finally(() => {
			connectingPromise = null;
		});

		return connectingPromise;
	}

	async function sendCDP<TResult extends CDPCommandResult>(
		method: string,
		params: JsonObject = {},
		sessionId?: string,
	): Promise<CDPCommandResponse<TResult>> {
		const activeSocket = socket;
		if (!isSocketOpen(activeSocket)) {
			throw new Error("Chrome WebSocket is not connected.");
		}

		return new Promise((resolve, reject) => {
			const id = ++nextCommandId;
			const message: CDPOutgoingMessage = { id, method, params };
			if (sessionId) {
				message.sessionId = sessionId;
			}

			const timer = setTimeout(() => {
				pending.delete(id);
				reject(new Error(`CDP command timed out: ${method}`));
			}, COMMAND_TIMEOUT_MS);

			pending.set(id, {
				resolve: (response) => {
					resolve(response as CDPCommandResponse<TResult>);
				},
				reject,
				timer,
			});

			activeSocket.send(JSON.stringify(message), (error) => {
				if (!error) {
					return;
				}

				clearTimeout(timer);
				pending.delete(id);
				reject(error);
			});
		});
	}

	async function enablePortGuard(sessionId: string): Promise<void> {
		if (chromeConnection === null || guardedSessions.has(sessionId)) {
			return;
		}

		try {
			await sendCDP(
				"Fetch.enable",
				{
					patterns: [
						{ urlPattern: `http://127.0.0.1:${chromeConnection.port}/*`, requestStage: "Request" },
						{ urlPattern: `http://localhost:${chromeConnection.port}/*`, requestStage: "Request" },
					],
				},
				sessionId,
			);
			guardedSessions.add(sessionId);
		} catch {
			// Blocking local probes is defense-in-depth; failures should not break the main flow.
		}
	}

	async function ensureSession(targetId: string): Promise<string> {
		const cached = sessions.get(targetId);
		if (cached) {
			return cached;
		}

		const response = await sendCDP<AttachToTargetResult>("Target.attachToTarget", { targetId, flatten: true });
		const sessionId = response.result?.sessionId;
		if (!sessionId) {
			throw new Error("Chrome did not return a session id for the target.");
		}

		sessions.set(targetId, sessionId);
		await enablePortGuard(sessionId);
		return sessionId;
	}

	async function waitForLoad(sessionId: string, timeoutMs = LOAD_TIMEOUT_MS): Promise<"complete" | "timeout"> {
		await sendCDP("Page.enable", {}, sessionId);

		return new Promise((resolve) => {
			let finished = false;

			const finish = (value: "complete" | "timeout") => {
				if (finished) {
					return;
				}

				finished = true;
				clearTimeout(timeout);
				clearInterval(interval);
				resolve(value);
			};

			const timeout = setTimeout(() => finish("timeout"), timeoutMs);
			const interval = setInterval(() => {
				void (async () => {
					try {
						const response = await sendCDP<RuntimeEvaluateResult>(
							"Runtime.evaluate",
							{
								expression: "document.readyState",
								returnByValue: true,
							},
							sessionId,
						);

						if (response.result?.result?.value === "complete") {
							finish("complete");
						}
					} catch {
						// The page may still be initializing. Keep polling until timeout.
					}
				})();
			}, 500);
		});
	}

	const endpointDescriptions = createEndpointDescriptions();

	const available = await checkPortAvailable(port);
	if (!available) {
		const existing = await probeExistingProxyHealth(port);
		if (existing !== null) {
			console.log(`[CDP Proxy] Existing instance is already running on port ${port}.`);
			return null;
		}

		throw new Error(`Port ${port} is already in use.`);
	}

	const server = createServer(async (request, response) => {
		const parsedUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
		const pathname = parsedUrl.pathname;
		const query = Object.fromEntries(parsedUrl.searchParams.entries()) as EndpointQuery;

		try {
			if (pathname === "/health") {
				writeJson(response, 200, {
					status: "ok",
					connected: isSocketOpen(socket),
					sessions: sessions.size,
					chromePort: chromeConnection?.port ?? null,
				} satisfies ProxyHealthResponse);
				return;
			}

			await connect();

			if (pathname === "/targets") {
				const result = await sendCDP<GetTargetsResult>("Target.getTargets");
				const pages = (result.result?.targetInfos ?? []).filter((target) => target.type === "page");
				writeJson(response, 200, pages);
				return;
			}

			if (pathname === "/new") {
				const targetUrl = query.url ?? "about:blank";
				const result = await sendCDP<CreateTargetResult>("Target.createTarget", {
					url: targetUrl,
					background: true,
				});
				const targetId = result.result?.targetId;
				if (!targetId) {
					throw new Error("Chrome did not return a target id.");
				}

				if (targetUrl !== "about:blank") {
					const sessionId = await ensureSession(targetId);
					await waitForLoad(sessionId);
				}

				writeJson(response, 200, { targetId });
				return;
			}

			if (pathname === "/close") {
				const targetId = requireQueryValue(query.target, "target");
				const result = await sendCDP("Target.closeTarget", { targetId });
				sessions.delete(targetId);
				writeJson(response, 200, result.result ?? { success: true });
				return;
			}

			if (pathname === "/navigate") {
				const targetId = requireQueryValue(query.target, "target");
				const targetUrl = requireQueryValue(query.url, "url");
				const sessionId = await ensureSession(targetId);
				const result = await sendCDP("Page.navigate", { url: targetUrl }, sessionId);
				await waitForLoad(sessionId);
				writeJson(response, 200, result.result ?? { ok: true });
				return;
			}

			if (pathname === "/back") {
				const targetId = requireQueryValue(query.target, "target");
				const sessionId = await ensureSession(targetId);
				await sendCDP("Runtime.evaluate", { expression: "history.back()" }, sessionId);
				await waitForLoad(sessionId);
				writeJson(response, 200, { ok: true });
				return;
			}

			if (pathname === "/eval") {
				const targetId = requireQueryValue(query.target, "target");
				const sessionId = await ensureSession(targetId);
				const expression = (await readBody(request)) || query.expr || "document.title";
				const result = await sendCDP<RuntimeEvaluateResult>(
					"Runtime.evaluate",
					{
						expression,
						returnByValue: true,
						awaitPromise: true,
					},
					sessionId,
				);

				if (result.result?.exceptionDetails?.text) {
					writeJson(response, 400, { error: result.result.exceptionDetails.text });
					return;
				}

				if (result.result?.result?.value !== undefined) {
					writeJson(response, 200, { value: result.result.result.value });
					return;
				}

				writeJson(response, 200, result.result ?? {});
				return;
			}

			if (pathname === "/click") {
				const targetId = requireQueryValue(query.target, "target");
				const selector = requireRequestBody(await readBody(request), "POST body must contain a CSS selector.");
				const selectorJson = JSON.stringify(selector);
				const sessionId = await ensureSession(targetId);
				const result = await sendCDP<RuntimeEvaluateResult>(
					"Runtime.evaluate",
					{
						expression: `(() => {
							const el = document.querySelector(${selectorJson});
							if (!el) return { error: "Element not found: " + ${selectorJson} };
							el.scrollIntoView({ block: "center" });
							el.click();
							return {
								clicked: true,
								tag: el.tagName,
								text: (el.textContent || "").slice(0, 100),
							};
						})()`,
						returnByValue: true,
						awaitPromise: true,
					},
					sessionId,
				);

				const value = result.result?.result?.value;
				if (isJsonObject(value) && typeof value.error === "string") {
					writeJson(response, 400, value);
					return;
				}

				writeJson(response, 200, value ?? result.result ?? {});
				return;
			}

			if (pathname === "/clickAt") {
				const targetId = requireQueryValue(query.target, "target");
				const selector = requireRequestBody(await readBody(request), "POST body must contain a CSS selector.");
				const selectorJson = JSON.stringify(selector);
				const sessionId = await ensureSession(targetId);
				const coordinates = await sendCDP<RuntimeEvaluateResult>(
					"Runtime.evaluate",
					{
						expression: `(() => {
							const el = document.querySelector(${selectorJson});
							if (!el) return { error: "Element not found: " + ${selectorJson} };
							el.scrollIntoView({ block: "center" });
							const rect = el.getBoundingClientRect();
							return {
								x: rect.x + rect.width / 2,
								y: rect.y + rect.height / 2,
								tag: el.tagName,
								text: (el.textContent || "").slice(0, 100),
							};
						})()`,
						returnByValue: true,
						awaitPromise: true,
					},
					sessionId,
				);

				const value = coordinates.result?.result?.value;
				if (!isJsonObject(value)) {
					throw new Error("Chrome did not return click coordinates.");
				}

				if (typeof value.error === "string") {
					writeJson(response, 400, value);
					return;
				}

				const x = typeof value.x === "number" ? value.x : null;
				const y = typeof value.y === "number" ? value.y : null;
				if (x === null || y === null) {
					throw new Error("Chrome returned invalid click coordinates.");
				}

				await sendCDP(
					"Input.dispatchMouseEvent",
					{ type: "mousePressed", x, y, button: "left", clickCount: 1 },
					sessionId,
				);
				await sendCDP(
					"Input.dispatchMouseEvent",
					{ type: "mouseReleased", x, y, button: "left", clickCount: 1 },
					sessionId,
				);

				writeJson(response, 200, {
					clicked: true,
					x,
					y,
					tag: typeof value.tag === "string" ? value.tag : undefined,
					text: typeof value.text === "string" ? value.text : undefined,
				});
				return;
			}

			if (pathname === "/setFiles") {
				const targetId = requireQueryValue(query.target, "target");
				const body = JSON.parse(await readBody(request)) as unknown;
				if (!isSetFilesRequestBody(body)) {
					throw new Error('POST body must contain {"selector": string, "files": string[]}.');
				}

				const sessionId = await ensureSession(targetId);
				await sendCDP("DOM.enable", {}, sessionId);

				const documentResult = await sendCDP<GetDocumentResult>("DOM.getDocument", {}, sessionId);
				const rootNodeId = documentResult.result?.root?.nodeId;
				if (rootNodeId === undefined) {
					throw new Error("Chrome did not return a document root node.");
				}

				const nodeResult = await sendCDP<QuerySelectorResult>(
					"DOM.querySelector",
					{ nodeId: rootNodeId, selector: body.selector },
					sessionId,
				);
				const nodeId = nodeResult.result?.nodeId;
				if (nodeId === undefined || nodeId === 0) {
					writeJson(response, 400, { error: `Element not found: ${body.selector}` });
					return;
				}

				await sendCDP("DOM.setFileInputFiles", { nodeId, files: body.files }, sessionId);
				writeJson(response, 200, { success: true, files: body.files.length });
				return;
			}

			if (pathname === "/scroll") {
				const targetId = requireQueryValue(query.target, "target");
				const amount = parsePort(query.y, 3000);
				const direction = query.direction ?? "down";
				const sessionId = await ensureSession(targetId);

				const expression =
					direction === "top"
						? 'window.scrollTo(0, 0); "scrolled to top"'
						: direction === "bottom"
							? 'window.scrollTo(0, document.body.scrollHeight); "scrolled to bottom"'
							: direction === "up"
								? `window.scrollBy(0, -${Math.abs(amount)}); "scrolled up ${Math.abs(amount)}px"`
								: `window.scrollBy(0, ${Math.abs(amount)}); "scrolled down ${Math.abs(amount)}px"`;

				const result = await sendCDP<RuntimeEvaluateResult>(
					"Runtime.evaluate",
					{
						expression,
						returnByValue: true,
					},
					sessionId,
				);
				await delay(800);
				writeJson(response, 200, { value: result.result?.result?.value });
				return;
			}

			if (pathname === "/screenshot") {
				const targetId = requireQueryValue(query.target, "target");
				const sessionId = await ensureSession(targetId);
				const format = query.format === "jpeg" ? "jpeg" : "png";
				const result = await sendCDP<CaptureScreenshotResult>(
					"Page.captureScreenshot",
					{
						format,
						...(format === "jpeg" ? { quality: 80 } : {}),
					},
					sessionId,
				);
				const data = result.result?.data;
				if (!data) {
					throw new Error("Chrome did not return screenshot data.");
				}

				const buffer = Buffer.from(data, "base64");
				if (query.file) {
					if (query.file.includes("..")) {
						throw new ClientError("Invalid file path: path traversal is not allowed.");
					}
					await writeFile(query.file, buffer);
					writeJson(response, 200, { saved: query.file });
					return;
				}

				response.statusCode = 200;
				response.setHeader("Content-Type", `image/${format}`);
				response.end(buffer);
				return;
			}

			if (pathname === "/info") {
				const targetId = requireQueryValue(query.target, "target");
				const sessionId = await ensureSession(targetId);
				const result = await sendCDP<RuntimeEvaluateResult>(
					"Runtime.evaluate",
					{
						expression: "({ title: document.title, url: location.href, ready: document.readyState })",
						returnByValue: true,
					},
					sessionId,
				);

				const value = result.result?.result?.value;
				writeJson(response, 200, (isJsonObject(value) ? value : {}) as PageInfo);
				return;
			}

			writeJson(response, 404, {
				error: "Unknown endpoint.",
				endpoints: endpointDescriptions,
			});
		} catch (error) {
			const statusCode = error instanceof ClientError ? 400 : 500;
			writeJson(response, statusCode, { error: getErrorMessage(error) });
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "127.0.0.1", () => {
			console.log(`[CDP Proxy] Listening on http://127.0.0.1:${port}`);
			if (logFile) {
				console.log(`[CDP Proxy] Logging to ${logFile}`);
			}

			void connect().catch((error) => {
				console.error(`[CDP Proxy] Initial Chrome connection failed: ${getErrorMessage(error)}`);
			});
			resolve();
		});
	});

	return server;
}

if (isExecutedDirectly()) {
	process.on("uncaughtException", (error) => {
		console.error(`[CDP Proxy] Uncaught exception: ${error.message}`);
	});

	process.on("unhandledRejection", (reason) => {
		console.error(`[CDP Proxy] Unhandled rejection: ${getErrorMessage(reason)}`);
	});

	const port = parsePort(process.env.CDP_PROXY_PORT, DEFAULT_PROXY_PORT);
	const logFile = process.env.CDP_PROXY_LOG_FILE ?? null;

	void startServer(port, logFile).catch((error) => {
		console.error(`[CDP Proxy] Failed to start: ${getErrorMessage(error)}`);
		process.exit(1);
	});
}
