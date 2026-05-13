import { printKeyValue, printWarnings } from "../formatters.js";
import type { CaptureNewResult, CaptureStatusResult, MetaCommandResult } from "../types.js";

export function isCaptureNewResult(r: MetaCommandResult): r is CaptureNewResult {
	return r.success && "capture" in r && "commandLibrarySnapshot" in r;
}

export function renderCaptureNewResult(result: CaptureNewResult): void {
	console.log(`Capture workspace created at ${result.capture.path}`);
	console.log("");
	printKeyValue("name:", result.capture.name);
	printKeyValue("domain:", result.capture.domain);
	printKeyValue("action:", result.capture.action);
	printKeyValue("runtime:", result.capture.runtime);
	console.log("");
	console.log("Command library snapshot:");
	printKeyValue("  total:", String(result.commandLibrarySnapshot.totalCommands));
	const sameDomain = result.commandLibrarySnapshot.sameDomainCommands;
	printKeyValue("  same domain:", sameDomain.length > 0 ? sameDomain.join(", ") : "none");
	printKeyValue("  name conflict:", result.commandLibrarySnapshot.nameConflict ? "yes" : "no");
	if (result.commandLibrarySnapshot.conflictSource !== undefined) {
		printKeyValue("  conflict source:", result.commandLibrarySnapshot.conflictSource);
	}
	if (result.warnings && result.warnings.length > 0) {
		console.log("");
		printWarnings(result.warnings);
	}
	console.log("");
	console.log(`Next: ${result.next}`);
}

export function isCaptureStatusResult(r: MetaCommandResult): r is CaptureStatusResult {
	return r.success && "artifacts" in r && "readyToFinalize" in r;
}

function formatNextHint(result: CaptureStatusResult): string {
	const { next, artifacts: a } = result;
	const base = `${next.action}${next.target ? ` (${next.target})` : ""}`;

	switch (next.action) {
		case "fill-evidence":
			return a.evidence.reason ? `${base}: ${a.evidence.reason}` : base;
		case "fill-manifest": {
			if (a.manifest.reason?.includes("does not match capture")) {
				return `${base}: ${a.manifest.reason}`;
			}
			if (a.manifest.status === "ready") {
				return `${base}: Add description`;
			}
			return a.manifest.reason ? `${base}: ${a.manifest.reason}` : base;
		}
		case "fill-command":
			return a.command.reason ? `${base}: ${a.command.reason}` : base;
		case "fill-readme":
			return a.readme.reason ? `${base}: ${a.readme.reason}` : base;
		case "fill-context":
			return a.context.reason ? `${base}: ${a.context.reason}` : base;
		case "validate":
			return a.validation.reason ? `${base}: ${a.validation.reason}` : base;
		case "request-user-confirmation":
			return `finalize: Ready to run "capture finalize"`;
		default:
			return base;
	}
}

export function renderCaptureStatusResult(result: CaptureStatusResult): void {
	console.log(`Capture status for ${result.capture.name}`);
	console.log(`Workspace: ${result.capture.path}`);
	console.log("");

	const a = result.artifacts;
	const states = [
		["evidence", a.evidence],
		["command", a.command],
		["manifest", a.manifest],
		["readme", a.readme],
		["context", a.context],
		["validation", a.validation],
	] as const;

	for (const [name, state] of states) {
		const statusLabel = state.status.toUpperCase();
		const reason = state.reason ? ` (${state.reason})` : "";
		console.log(`  ${name.padEnd(12)} ${statusLabel}${reason}`);
	}

	console.log("");
	if (result.readyToFinalize) {
		console.log("Status: READY TO FINALIZE");
		console.log(`Next: ${formatNextHint(result)}`);
	} else {
		console.log(`Next: ${formatNextHint(result)}`);
	}

	if (result.warnings && result.warnings.length > 0) {
		console.log("");
		printWarnings(result.warnings);
	}
}
