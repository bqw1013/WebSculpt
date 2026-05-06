import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getDaemonStateDir } from "../config/paths.js";

interface MetricsSnapshot {
	session: {
		startedAt: string;
		endedAt: string;
		uptimeSec: number;
		totalExecutions: number;
		successCount: number;
		errorCount: number;
		peakConcurrent: number;
		peakPages: number;
		peakRssMB: number;
		shutdownReason: string;
	};
}

let startedAt = Date.now();
let totalExecutions = 0;
let successCount = 0;
let errorCount = 0;
let peakConcurrent = 0;
let peakPages = 0;
let peakRssMB = 0;

/**
 * Resets all accumulated metrics. Intended for testing only.
 */
export function resetMetrics(): void {
	startedAt = Date.now();
	totalExecutions = 0;
	successCount = 0;
	errorCount = 0;
	peakConcurrent = 0;
	peakPages = 0;
	peakRssMB = 0;
}

/**
 * Records the start of a command execution, updating concurrent and total counters.
 */
export function recordExecutionStart(activeSessions: number): void {
	totalExecutions++;
	if (activeSessions > peakConcurrent) {
		peakConcurrent = activeSessions;
	}
}

/**
 * Records the end of a command execution, tracking success or error.
 */
export function recordExecutionEnd(success: boolean): void {
	if (success) {
		successCount++;
	} else {
		errorCount++;
	}
}

/**
 * Updates the peak page count if the current count is higher.
 */
export function recordPeakPages(currentPages: number): void {
	if (currentPages > peakPages) {
		peakPages = currentPages;
	}
}

/**
 * Updates the peak RSS if the current RSS is higher.
 */
export function recordPeakRss(currentRssMB: number): void {
	if (currentRssMB > peakRssMB) {
		peakRssMB = currentRssMB;
	}
}

/**
 * Flushes the accumulated metrics to disk as a JSON snapshot.
 */
export async function flushMetrics(shutdownReason: string): Promise<void> {
	const now = Date.now();
	const snapshot: MetricsSnapshot = {
		session: {
			startedAt: new Date(startedAt).toISOString(),
			endedAt: new Date(now).toISOString(),
			uptimeSec: Math.floor((now - startedAt) / 1000),
			totalExecutions,
			successCount,
			errorCount,
			peakConcurrent,
			peakPages,
			peakRssMB,
			shutdownReason,
		},
	};

	const metricsPath = join(getDaemonStateDir(), "daemon-metrics.json");
	try {
		await writeFile(metricsPath, JSON.stringify(snapshot, null, 2), "utf-8");
	} catch {
		// Ignore write errors during shutdown to avoid blocking exit.
	}
}
