import { printJson } from "./formatters.js";
import { renderers } from "./registry.js";
import type { MetaCommandResult, OutputFormat } from "./types.js";

/** Renders a meta command result as either human-readable text or JSON. */
export function renderOutput(result: MetaCommandResult, format: OutputFormat): void {
	if (format === "json") {
		printJson(result);
		if (!result.success) {
			process.exitCode = 1;
		}
		return;
	}

	for (const renderer of renderers) {
		if (renderer.predicate(result)) {
			renderer.render(result);
			if (!result.success) {
				process.exitCode = 1;
			}
			return;
		}
	}

	console.warn("[renderOutput] Unhandled result type:");
	printJson(result);
	process.exitCode = 1;
}
