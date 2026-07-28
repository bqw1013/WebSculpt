/**
 * Operational limits for the daemon, centralized so they can be exposed
 * via the health endpoint and enforced by resource-guard logic.
 */
export const DAEMON_LIMITS = {
	commandTimeoutSec: 20 * 60,
	maxConcurrentSessions: 20,
	maxTotalPages: 50,
	memoryWarningMB: 500,
	memoryLimitMB: 800,
	memoryEmergencyMB: 1200,
	memoryLimitConsecutiveSamples: 2,
	restartAfterExecutions: 2000,
} as const;
