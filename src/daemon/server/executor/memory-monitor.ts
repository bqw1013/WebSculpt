import { DAEMON_LIMITS } from "../config/limits.js";
import { logEvent } from "../observability/logger.js";
import { recordPeakPages, recordPeakRss } from "../observability/metrics.js";
import { getOpenPageCount } from "./browser-manager.js";

const MEMORY_CHECK_INTERVAL_MS = 60_000;

export let degraded = false;
export let restartPending = false;
let memoryCheckTimer: NodeJS.Timeout | null = null;
let stopped = false;

/**
 * Sets the restart-pending flag. Exported so callers outside this module
 * can trigger drain mode (e.g., after execution count thresholds).
 */
export function setRestartPending(value: boolean): void {
	restartPending = value;
}

/**
 * Starts a background timer that samples RSS every 60 seconds.
 * Triggers degraded/drain/emergency states based on configured thresholds.
 */
export function startMemoryMonitoring(onEmergency: () => void): void {
	if (memoryCheckTimer) {
		return;
	}
	stopped = false;

	memoryCheckTimer = setInterval(() => {
		if (stopped) {
			return;
		}

		const rssMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
		recordPeakRss(rssMB);
		recordPeakPages(getOpenPageCount());

		if (rssMB >= DAEMON_LIMITS.memoryEmergencyMB) {
			stopped = true;
			stopMemoryMonitoring();
			onEmergency();
			return;
		}

		if (rssMB >= DAEMON_LIMITS.memoryLimitMB) {
			if (!restartPending) {
				restartPending = true;
				logEvent("WARN", "daemon_shutdown", { reason: "memory_limit", rss_mb: rssMB });
			}
		} else if (rssMB >= DAEMON_LIMITS.memoryWarningMB) {
			if (!degraded) {
				degraded = true;
				logEvent("WARN", "mem_high", { rss_mb: rssMB, threshold_mb: DAEMON_LIMITS.memoryWarningMB });
			}
		} else {
			if (degraded) {
				degraded = false;
			}
		}
	}, MEMORY_CHECK_INTERVAL_MS);
}

/**
 * Stops the memory monitoring timer.
 */
export function stopMemoryMonitoring(): void {
	stopped = true;
	if (memoryCheckTimer) {
		clearInterval(memoryCheckTimer);
		memoryCheckTimer = null;
	}
}

/**
 * Resets monitor state for testing.
 */
export function resetMonitorState(): void {
	degraded = false;
	restartPending = false;
	stopped = false;
	stopMemoryMonitoring();
}
