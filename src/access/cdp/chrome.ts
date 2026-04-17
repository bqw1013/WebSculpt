import { readFile } from "node:fs/promises";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ChromeDiscovery } from "./types.js";

const PORT_CHECK_TIMEOUT_MS = 2000;
const COMMON_CHROME_PORTS = [9222, 9229, 9333] as const;

function getActivePortFiles(): string[] {
	const home = homedir();
	const localAppData = process.env.LOCALAPPDATA ?? "";

	switch (process.platform) {
		case "darwin":
			return [
				join(home, "Library", "Application Support", "Google", "Chrome", "DevToolsActivePort"),
				join(home, "Library", "Application Support", "Google", "Chrome Canary", "DevToolsActivePort"),
				join(home, "Library", "Application Support", "Chromium", "DevToolsActivePort"),
			];
		case "linux":
			return [
				join(home, ".config", "google-chrome", "DevToolsActivePort"),
				join(home, ".config", "chromium", "DevToolsActivePort"),
			];
		case "win32":
			return [
				join(localAppData, "Google", "Chrome", "User Data", "DevToolsActivePort"),
				join(localAppData, "Chromium", "User Data", "DevToolsActivePort"),
			];
		default:
			return [];
	}
}

function parsePort(raw: string): number | null {
	const value = Number.parseInt(raw, 10);
	return Number.isInteger(value) && value > 0 && value < 65536 ? value : null;
}

function normalizeWebSocketPath(rawPath: string | undefined): string | null {
	if (!rawPath) {
		return null;
	}

	return rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
}

function checkPort(port: number, timeoutMs = PORT_CHECK_TIMEOUT_MS): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = net.createConnection({ port, host: "127.0.0.1" });
		const finish = (result: boolean) => {
			socket.destroy();
			resolve(result);
		};

		socket.setTimeout(timeoutMs);
		socket.once("connect", () => finish(true));
		socket.once("timeout", () => finish(false));
		socket.once("error", () => finish(false));
	});
}

async function readActivePortFile(filePath: string): Promise<ChromeDiscovery | null> {
	try {
		const content = await readFile(filePath, "utf8");
		const [rawPort, rawWsPath] = content.trim().split(/\r?\n/);
		const port = parsePort(rawPort ?? "");

		if (port === null || !(await checkPort(port))) {
			return null;
		}

		return {
			port,
			wsPath: normalizeWebSocketPath(rawWsPath),
		};
	} catch {
		return null;
	}
}

/**
 * Returns the most likely Chrome remote-debugging endpoint for the current machine.
 */
export async function discoverChromeDebuggingTarget(): Promise<ChromeDiscovery | null> {
	for (const filePath of getActivePortFiles()) {
		const discovery = await readActivePortFile(filePath);
		if (discovery !== null) {
			return discovery;
		}
	}

	for (const port of COMMON_CHROME_PORTS) {
		if (await checkPort(port)) {
			return { port, wsPath: null };
		}
	}

	return null;
}

/**
 * Detects the Chrome remote-debugging TCP port without exposing transport details to callers.
 */
export async function detectChromePort(): Promise<number | null> {
	const discovery = await discoverChromeDebuggingTarget();
	return discovery?.port ?? null;
}

export function getChromeWebSocketUrl(discovery: ChromeDiscovery): string {
	const wsPath = discovery.wsPath ?? "/devtools/browser";
	return `ws://127.0.0.1:${discovery.port}${wsPath}`;
}
