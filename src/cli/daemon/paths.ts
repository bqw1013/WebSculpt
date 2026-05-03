import { createHash } from "node:crypto";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

const STATE_DIR = join(homedir(), ".websculpt");

/**
 * Returns a safe, deterministic identifier for the current user.
 * On Windows this is a hashed username to avoid invalid pipe name characters.
 * On Unix the raw uid is used directly in the socket path.
 */
function getUserIdentifier(): string {
	if (process.platform === "win32") {
		return createHash("sha256").update(userInfo().username).digest("hex").slice(0, 16);
	}
	return String(process.getuid?.() ?? 0);
}

/**
 * Returns the platform-specific socket path for the daemon.
 * Windows uses a named pipe; Unix uses a domain socket in /tmp.
 */
export function getSocketPath(): string {
	if (process.platform === "win32") {
		return `\\\\.\\pipe\\websculpt-daemon-${getUserIdentifier()}`;
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
