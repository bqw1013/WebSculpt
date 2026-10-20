import { appendLog } from "../../../infra/store.js";
import type { ResolvedCommand } from "../contract.js";
import { runCommand } from "./dispatcher.js";

/** Engine-owned metadata attached to every command execution result. */
export interface ExecutionMeta {
	/** Wall-clock duration of the full dispatch, in milliseconds. */
	duration: number;
	/** ISO 8601 UTC timestamp of when execution finished. */
	finishedAt: string;
}

/** Successful command execution result. */
export interface ExecutionSuccess {
	success: true;
	command: string;
	data: unknown;
	meta: ExecutionMeta;
}

/** Failed command execution result. */
export interface ExecutionFailure {
	success: false;
	command: string;
	error: { code: string; message: string };
	meta: ExecutionMeta;
}

/** Union of success and failure execution results. */
export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

function buildExecutionMeta(start: number): ExecutionMeta {
	return { duration: Date.now() - start, finishedAt: new Date().toISOString() };
}

function toExecutionError(err: unknown): { code: string; message: string } {
	const message = err instanceof Error ? err.message : String(err);
	const code =
		err instanceof Error && "code" in err && typeof err.code === "string" ? err.code : "COMMAND_EXECUTION_ERROR";
	return { code, message };
}

/**
 * Executes a resolved command with the given arguments.
 * Handles timing, logging, and error normalization internally.
 * The caller decides how to render the returned result.
 */
export async function executeCommand(
	resolved: ResolvedCommand,
	args: Record<string, string>,
): Promise<ExecutionResult> {
	const start = Date.now();
	const command = `${resolved.manifest.domain}/${resolved.manifest.action}`;

	let result: ExecutionResult;
	try {
		const data = await runCommand(resolved.manifest, resolved.commandPath, args);
		result = { success: true, command, data, meta: buildExecutionMeta(start) };
	} catch (err: unknown) {
		result = { success: false, command, error: toExecutionError(err), meta: buildExecutionMeta(start) };
	}

	await appendLog({
		time: result.meta.finishedAt,
		domain: resolved.manifest.domain,
		action: resolved.manifest.action,
		result,
	});
	return result;
}
