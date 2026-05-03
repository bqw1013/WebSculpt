import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDaemonStateDir } from "../../daemon/paths.js";

export const DAEMON_JSON = join(getDaemonStateDir(), "daemon.json");

export interface DaemonState {
	pid: number;
	socketPath: string;
}

/**
 * Reads the persisted daemon state from disk.
 */
export async function readDaemonState(): Promise<DaemonState | null> {
	try {
		const text = await readFile(DAEMON_JSON, "utf-8");
		return JSON.parse(text) as DaemonState;
	} catch {
		return null;
	}
}

/**
 * Writes the daemon state to disk for discovery by future CLI invocations.
 */
export async function writeDaemonState(state: DaemonState): Promise<void> {
	await mkdir(getDaemonStateDir(), { recursive: true });
	await writeFile(DAEMON_JSON, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Checks whether a process with the given PID is alive.
 * Non-positive PIDs are treated as invalid (used for provisional states).
 */
export function isProcessAlive(pid: number): boolean {
	if (pid <= 0) {
		return false;
	}
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
