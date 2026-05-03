/**
 * Operational limits for the daemon, centralized so they can be exposed
 * via the health endpoint and enforced by resource-guard logic.
 */
export const DAEMON_LIMITS = {
	commandTimeoutSec: 20 * 60,
	maxConcurrentSessions: 20,
	maxTotalPages: 50,
	memoryWarningMB: 400,
	memoryLimitMB: 600,
	restartAfterExecutions: 200,
} as const;
