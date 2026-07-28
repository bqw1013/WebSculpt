import { DAEMON_LIMITS } from "../config/limits.js";
import { logEvent } from "../observability/logger.js";
import { recordPeakPages, recordPeakRss } from "../observability/metrics.js";
import { getOpenPageCount } from "./browser-manager.js";

const MEMORY_CHECK_INTERVAL_MS = 60_000;

export let degraded = false;
export let restartPending = false;
let memoryCheckTimer: NodeJS.Timeout | null = null;
let stopped = false;
let consecutiveLimitSamples = 0;
let cleanupInProgress = false;

function toMB(bytes: number): number {
	return Math.round(bytes / 1024 / 1024);
}

function requestMemoryCleanup(onMemoryPressure?: () => void | Promise<void>): void {
	if (!onMemoryPressure || cleanupInProgress) {
		return;
	}

	cleanupInProgress = true;
	Promise.resolve(onMemoryPressure())
		.catch(() => {
			// Cleanup is best-effort; the next memory sample still enforces hard limits.
		})
		.finally(() => {
			cleanupInProgress = false;
		});
}

/**
 * Sets the restart-pending flag. Exported so callers outside this module
 * can trigger drain mode (e.g., after execution count thresholds).
 */
export function setRestartPending(value: boolean): void {
	restartPending = value;
}

/**
 * Starts a background timer that samples RSS every 60 seconds.
 * Triggers cleanup, degraded, drain, and emergency states based on configured thresholds.
 * A normal restart requires consecutive over-limit samples so a transient
 * serialization spike cannot force a new browser authorization cycle.
 */
export function startMemoryMonitoring(onEmergency: () => void, onMemoryPressure?: () => void | Promise<void>): void {
	if (memoryCheckTimer) {
		return;
	}
	stopped = false;

	memoryCheckTimer = setInterval(() => {
		if (stopped) {
			return;
		}

		const memory = process.memoryUsage();
		const rssMB = toMB(memory.rss);
		const memoryDetails = {
			rss_mb: rssMB,
			heap_used_mb: toMB(memory.heapUsed),
			heap_total_mb: toMB(memory.heapTotal),
			external_mb: toMB(memory.external),
			array_buffers_mb: toMB(memory.arrayBuffers),
		};
		recordPeakRss(rssMB);
		recordPeakPages(getOpenPageCount());

		if (rssMB >= DAEMON_LIMITS.memoryEmergencyMB) {
			stopped = true;
			stopMemoryMonitoring();
			onEmergency();
			return;
		}

		if (rssMB >= DAEMON_LIMITS.memoryWarningMB) {
			requestMemoryCleanup(onMemoryPressure);
			if (!degraded) {
				degraded = true;
				logEvent("WARN", "mem_high", {
					...memoryDetails,
					threshold_mb: DAEMON_LIMITS.memoryWarningMB,
				});
			}
		} else if (degraded) {
			degraded = false;
		}

		if (rssMB >= DAEMON_LIMITS.memoryLimitMB) {
			consecutiveLimitSamples++;
			if (consecutiveLimitSamples >= DAEMON_LIMITS.memoryLimitConsecutiveSamples && !restartPending) {
				restartPending = true;
				logEvent("WARN", "daemon_shutdown", {
					reason: "memory_limit",
					...memoryDetails,
					consecutive_samples: consecutiveLimitSamples,
				});
			}
		} else {
			consecutiveLimitSamples = 0;
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
	consecutiveLimitSamples = 0;
	cleanupInProgress = false;
	stopMemoryMonitoring();
}
