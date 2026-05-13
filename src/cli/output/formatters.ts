import type { ValidationDetail } from "../../types/index.js";

/** Formats uptime in full precision (e.g. "1h 59m 59s", "5m 3s", "42s"). */
export function formatUptime(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = seconds % 60;
	const parts: string[] = [];
	if (h > 0) parts.push(`${h}h`);
	if (m > 0) parts.push(`${m}m`);
	if (s > 0 || parts.length === 0) parts.push(`${s}s`);
	return parts.join(" ");
}

/** Joins string values padded to fixed column widths. */
export function formatRow(values: string[], widths: number[], padding = 2): string {
	return values.map((v, i) => v.padEnd((widths[i] ?? 0) + padding)).join("");
}

/** Prints a label-value pair with the label padded to 12 characters. */
export function printKeyValue(label: string, value: string): void {
	console.log(`${label.padEnd(12)}${value}`);
}

/** Prints a list of validation warnings. */
export function printWarnings(warnings: ValidationDetail[]): void {
	console.log("Warnings:");
	for (const w of warnings) {
		console.log(`  [${w.level.toUpperCase()}] ${w.code}: ${w.message}`);
	}
}

/** Prints a value as pretty-printed JSON to stdout. */
export function printJson(data: unknown): void {
	try {
		console.log(JSON.stringify(data, null, 2));
	} catch (err) {
		console.error("Failed to serialize output:", err instanceof Error ? err.message : String(err));
	}
}
