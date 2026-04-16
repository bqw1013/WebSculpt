import { initStore } from "../../infra/store.js";
import type { MetaCommandResult } from "../output.js";

/** Initializes the WebSculpt environment and returns a normalized result. */
export async function handleConfigInit(): Promise<MetaCommandResult> {
	await initStore();
	return {
		success: true,
		message: "WebSculpt initialized.",
	};
}
