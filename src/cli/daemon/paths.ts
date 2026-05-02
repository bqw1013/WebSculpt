import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(homedir(), ".websculpt");

/**
 * Returns the platform-specific socket path for the daemon.
 * Windows uses a named pipe; Unix uses a domain socket in /tmp.
 */
export function getSocketPath(): string {
	if (process.platform === "win32") {
		const username = userInfo().username;
		return `\\\\.\\pipe\\websculpt-daemon-${username}`;
	}
	const uid = process.getuid?.() ?? 0;
	return `/tmp/websculpt-daemon-${uid}.sock`;
}

/**
 * Returns the path to the daemon log file.
 */
export function getDaemonLogPath(): string {
	return join(STATE_DIR, "daemon.log");
}

/**
 * Returns the path to the daemon state directory.
 */
export function getDaemonStateDir(): string {
	return STATE_DIR;
}
