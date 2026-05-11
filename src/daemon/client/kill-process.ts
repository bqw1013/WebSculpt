import { spawn } from "node:child_process";

const GRACEFUL_SHUTDOWN_MS = 2000;

/**
 * Attempts to terminate a daemon process gracefully, falling back to force-kill
 * if it does not exit within a short window. On Windows the entire process tree
 * is killed via taskkill; on Unix SIGTERM is sent first, followed by SIGKILL.
 *
 * Errors are swallowed so that a failed kill never blocks daemon restart.
 */
export async function killDaemonProcess(pid: number): Promise<void> {
	if (pid <= 0) {
		return;
	}

	if (process.platform === "win32") {
		await killWindows(pid);
	} else {
		await killUnix(pid);
	}
}

async function killWindows(pid: number): Promise<void> {
	return new Promise<void>((resolve) => {
		const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
			windowsHide: true,
			detached: true,
			stdio: "ignore",
		});

		child.on("error", () => resolve());
		child.on("exit", () => resolve());

		// Failsafe: resolve even if we never receive an event.
		setTimeout(resolve, 5000);
	});
}

async function killUnix(pid: number): Promise<void> {
	try {
		process.kill(pid, "SIGTERM");
	} catch {
		// Already gone.
		return;
	}

	const start = Date.now();
	while (Date.now() - start < GRACEFUL_SHUTDOWN_MS) {
		try {
			process.kill(pid, 0);
		} catch {
			// Process exited.
			return;
		}
		await new Promise((r) => setTimeout(r, 100));
	}

	// Force-kill if still alive.
	try {
		process.kill(pid, "SIGKILL");
	} catch {
		// Already gone.
	}
}
