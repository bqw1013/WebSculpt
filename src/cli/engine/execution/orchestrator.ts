import { appendLog } from "../../../infra/store.js";
import type { ResolvedCommand } from "../contract.js";
import { runCommand } from "./dispatcher.js";

/** Successful command execution result. */
export interface ExecutionSuccess {
	success: true;
	command: string;
	data: unknown;
	meta: { duration: number };
}

/** Failed command execution result. */
export interface ExecutionFailure {
	success: false;
	command: string;
	error: { code: string; message: string };
	meta: { duration: number };
}

/** Union of success and failure execution results. */
export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

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

	try {
		const data = await runCommand(resolved.manifest, resolved.commandPath, args);
		const result: ExecutionSuccess = {
			success: true,
			command,
			data,
			meta: { duration: Date.now() - start },
		};
		await appendLog({
			time: new Date().toISOString(),
			domain: resolved.manifest.domain,
			action: resolved.manifest.action,
			result,
		});
		return result;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		const code =
			err instanceof Error && "code" in err && typeof err.code === "string" ? err.code : "COMMAND_EXECUTION_ERROR";
		const result: ExecutionFailure = {
			success: false,
			command,
			error: { code, message },
			meta: { duration: Date.now() - start },
		};
		await appendLog({
			time: new Date().toISOString(),
			domain: resolved.manifest.domain,
			action: resolved.manifest.action,
			result,
		});
		return result;
	}
}
