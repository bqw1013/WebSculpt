import type { MetaCommandError, MetaCommandResult, ValidationErrorResult } from "../types.js";

export function isMetaCommandError(r: MetaCommandResult): r is MetaCommandError | ValidationErrorResult {
	return !r.success;
}

export function renderError(result: MetaCommandError | ValidationErrorResult): void {
	console.log(`${result.error.code}: ${result.error.message}`);
	if ("details" in result.error && Array.isArray(result.error.details)) {
		for (const detail of result.error.details) {
			console.log(`  [${detail.level.toUpperCase()}] ${detail.code}: ${detail.message}`);
		}
	}
}
