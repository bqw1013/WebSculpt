import { printKeyValue } from "../formatters.js";
import type { MetaCommandResult, ScopeShowResult } from "../types.js";

export function isScopeShowResult(r: MetaCommandResult): r is ScopeShowResult {
	return r.success && "scopeCommands" in r && Array.isArray((r as ScopeShowResult).scopeCommands);
}

export function renderScopeShowResult(result: ScopeShowResult): void {
	if (result.scopeCommands.length === 0) {
		console.log("No commands configured in scope.");
		return;
	}

	console.log("Scoped commands:");
	for (const entry of result.scopeCommands) {
		const status = entry.valid ? "valid" : "missing";
		printKeyValue(`  ${entry.command}:`, status);
	}
}
