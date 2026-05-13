import type { ConfigInitResult, MetaCommandResult } from "../types.js";

export function isConfigInitResult(r: MetaCommandResult): r is ConfigInitResult {
	return r.success && "message" in r && typeof (r as ConfigInitResult).message === "string";
}

export function renderConfigInit(result: ConfigInitResult): void {
	console.log(result.message);
}
