import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CDP_PROXY_LOG_FILE, LOGS_DIR } from "../../infra/paths.js";
import { readConfig } from "../../infra/store.js";
import { detectChromePort } from "./chrome.js";
import type { ProxyHealthResponse, ProxyResult } from "./types.js";

const DEFAULT_PROXY_PORT = 3456;
const DEFAULT_REQUEST_TIMEOUT_MS = 3000;
const READY_POLL_TIMEOUT_MS = 20000;
const READY_POLL_INTERVAL_MS = 1000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function buildProxyUrl(port: number): string {
	return `http://127.0.0.1:${port}`;
}

function parseConfiguredPort(value: unknown): number {
	if (typeof value === "number" && Number.isInteger(value) && value > 0 && value < 65536) {
		return value;
	}

	if (typeof value === "string") {
		const parsed = Number.parseInt(value, 10);
		if (Number.isInteger(parsed) && parsed > 0 && parsed < 65536) {
			return parsed;
		}
	}

	return DEFAULT_PROXY_PORT;
}

function getServerScriptPath(): string {
	const extension = extname(__filename).toLowerCase();
	return join(__dirname, extension === ".ts" ? "server.ts" : "server.js");
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function getRequestTimeout(deadline: number, capMs: number): number {
	return Math.max(1, Math.min(capMs, deadline - Date.now()));
}

async function getJson<T>(url: string, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<T | null> {
	try {
		const response = await fetch(url, {
			signal: AbortSignal.timeout(timeoutMs),
		});

		if (!response.ok) {
			return null;
		}

		const raw = await response.text();
		return JSON.parse(raw) as T;
	} catch {
		return null;
	}
}

function isProxyHealthResponse(value: unknown): value is ProxyHealthResponse {
	if (typeof value !== "object" || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;
	return (
		candidate.status === "ok" &&
		typeof candidate.connected === "boolean" &&
		typeof candidate.sessions === "number" &&
		(typeof candidate.chromePort === "number" || candidate.chromePort === null)
	);
}

async function getProxyHealth(
	url: string,
	timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<ProxyHealthResponse | null> {
	const value = await getJson<unknown>(`${url}/health`, timeoutMs);
	return isProxyHealthResponse(value) ? value : null;
}

async function getProxyTargets(url: string, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<unknown[] | null> {
	const value = await getJson<unknown>(`${url}/targets`, timeoutMs);
	return Array.isArray(value) ? value : null;
}

async function waitForProxyReady(
	url: string,
	timeoutMs: number,
	initialDelayMs = 0,
): Promise<ProxyHealthResponse | null> {
	if (initialDelayMs > 0) {
		await delay(initialDelayMs);
	}

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		const health = await getProxyHealth(url, getRequestTimeout(deadline, DEFAULT_REQUEST_TIMEOUT_MS));
		const targets = await getProxyTargets(url, getRequestTimeout(deadline, 8000));

		if (health !== null && targets !== null) {
			return health;
		}

		await delay(READY_POLL_INTERVAL_MS);
	}

	return null;
}

async function isPortListening(port: number): Promise<boolean> {
	try {
		const health = await fetch(`${buildProxyUrl(port)}/health`, {
			signal: AbortSignal.timeout(1000),
		});
		return health.ok;
	} catch {
		return new Promise((resolve) => {
			const socket = new net.Socket();
			const finish = (result: boolean) => {
				socket.destroy();
				resolve(result);
			};

			socket.setTimeout(1000);
			socket.once("connect", () => finish(true));
			socket.once("timeout", () => finish(false));
			socket.once("error", () => finish(false));
			socket.connect(port, "127.0.0.1");
		});
	}
}

async function startProxyDetached(port: number, logFile: string): Promise<void> {
	await mkdir(LOGS_DIR, { recursive: true });

	const logFd = openSync(logFile, "a");
	const child = spawn(process.execPath, [...process.execArgv, getServerScriptPath()], {
		detached: true,
		stdio: ["ignore", logFd, logFd],
		env: {
			...process.env,
			CDP_PROXY_PORT: String(port),
			CDP_PROXY_LOG_FILE: logFile,
		},
		...(process.platform === "win32" ? { windowsHide: true } : {}),
	});

	child.unref();
	closeSync(logFd);
}

function getChromeUnavailableReason(): string {
	return 'Chrome is not running with remote debugging enabled. Open chrome://inspect/#remote-debugging and enable "Allow remote debugging for this browser instance".';
}

/**
 * Ensures a local CDP proxy is available and returns a normalized status object for callers.
 */
export async function ensureCDPProxy(): Promise<ProxyResult> {
	const config = await readConfig();
	const port = parseConfiguredPort(config.cdpProxyPort);
	const url = buildProxyUrl(port);

	const existingHealth = await getProxyHealth(url);
	if (existingHealth !== null) {
		const readyHealth = await waitForProxyReady(url, 8000);
		if (readyHealth !== null) {
			return {
				ok: true,
				url,
				chromePort: readyHealth.chromePort,
			};
		}

		return {
			ok: false,
			url,
			chromePort: existingHealth.chromePort ?? (await detectChromePort()),
			reason: "An existing CDP proxy is running but could not connect to Chrome.",
		};
	}

	if (await isPortListening(port)) {
		return {
			ok: false,
			url,
			chromePort: await detectChromePort(),
			reason: `Port ${port} is already in use by another process.`,
		};
	}

	const chromePort = await detectChromePort();
	if (chromePort === null) {
		return {
			ok: false,
			url,
			chromePort: null,
			reason: getChromeUnavailableReason(),
		};
	}

	try {
		await startProxyDetached(port, CDP_PROXY_LOG_FILE);
	} catch (error) {
		return {
			ok: false,
			url,
			chromePort,
			reason: error instanceof Error ? error.message : String(error),
		};
	}

	const readyHealth = await waitForProxyReady(url, READY_POLL_TIMEOUT_MS, 2000);
	if (readyHealth !== null) {
		return {
			ok: true,
			url,
			chromePort: readyHealth.chromePort ?? chromePort,
		};
	}

	const reason = (await isPortListening(port))
		? `Timed out waiting for the CDP proxy to become ready. Check ${CDP_PROXY_LOG_FILE} for details.`
		: "The CDP proxy process exited before it became ready.";

	return {
		ok: false,
		url,
		chromePort,
		reason,
	};
}
