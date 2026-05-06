export interface SocketRequest {
	id: number;
	method: string;
	params?: Record<string, unknown>;
}

export interface SocketResponse {
	id: number;
	result?: unknown;
	error?: { message: string; code: string };
}

/**
 * Splits a buffer into complete lines and returns the remaining incomplete buffer.
 */
export function splitLines(buffer: string): [string[], string] {
	const lines = buffer.split("\n");
	const remainder = lines.pop() ?? "";
	return [lines, remainder];
}
