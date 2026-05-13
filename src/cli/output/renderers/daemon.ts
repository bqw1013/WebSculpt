import { formatUptime, printKeyValue } from "../formatters.js";
import type {
	DaemonLogsResult,
	DaemonRestartResult,
	DaemonStartResult,
	DaemonStatusResult,
	DaemonStopResult,
	MetaCommandResult,
} from "../types.js";

export function isDaemonStatusResult(r: MetaCommandResult): r is DaemonStatusResult {
	return r.success && "status" in r && typeof (r as DaemonStatusResult).status === "object";
}

export function renderDaemonStatus(result: DaemonStatusResult): void {
	const s = result.status;
	console.log("Daemon Status");
	console.log("=============");
	printKeyValue("PID:", String(s.pid));
	printKeyValue("Uptime:", formatUptime(s.uptime));
	printKeyValue("Healthy:", s.healthy ? "yes" : "no");
	printKeyValue("Degraded:", s.degraded ? "yes" : "no");
	console.log("");
	console.log("Browser");
	printKeyValue("  Connected:", s.browser.connected ? "yes" : "no");
	printKeyValue("  Pages:", String(s.browser.pages));
	console.log("");
	console.log("Sessions");
	printKeyValue("  Active:", `${s.sessions.active} / ${s.sessions.max}`);
	printKeyValue("  Total:", String(s.sessions.total));
	console.log("");
	console.log("Resources");
	printKeyValue("  RSS:", `${s.resources.rssMB} MB`);
	printKeyValue("  Heap:", `${s.resources.heapUsedMB} / ${s.resources.heapTotalMB} MB`);
	console.log("");
	console.log("Limits");
	printKeyValue("  Command timeout:", `${Math.floor(s.limits.commandTimeoutSec / 60)} min`);
	printKeyValue("  Max sessions:", String(s.limits.maxConcurrentSessions));
	printKeyValue("  Max pages:", String(s.limits.maxTotalPages));
	printKeyValue("  Restart after:", `${s.limits.restartAfterExecutions} executions`);
	if (s.degraded) {
		console.log("");
		console.log("WARNING: Daemon is degraded");
	}
}

export function isDaemonLogsResult(r: MetaCommandResult): r is DaemonLogsResult {
	return r.success && "lines" in r && Array.isArray((r as DaemonLogsResult).lines);
}

export function renderDaemonLogs(result: DaemonLogsResult): void {
	for (const line of result.lines) {
		console.log(line);
	}
}

export function isDaemonStartResult(r: MetaCommandResult): r is DaemonStartResult {
	return r.success && "message" in r && typeof (r as DaemonStartResult).message === "string";
}

export function renderDaemonStart(result: DaemonStartResult): void {
	console.log(result.message);
}

export function isDaemonStopResult(r: MetaCommandResult): r is DaemonStopResult {
	return r.success && "message" in r && typeof (r as DaemonStopResult).message === "string";
}

export function renderDaemonStop(result: DaemonStopResult): void {
	console.log(result.message);
}

export function isDaemonRestartResult(r: MetaCommandResult): r is DaemonRestartResult {
	return r.success && "message" in r && typeof (r as DaemonRestartResult).message === "string";
}

export function renderDaemonRestart(result: DaemonRestartResult): void {
	console.log(result.message);
}
