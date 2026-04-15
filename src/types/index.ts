/** Supported execution runtimes for a command entry. */
export type CommandRuntime = "node" | "shell" | "python";

/** Defines the metadata and contract for a single WebSculpt command. */
export interface CommandManifest {
	id: string;
	domain: string;
	action: string;
	description?: string;
	parameters?: string[];
	outputSchema?: Record<string, unknown>;
	/** Execution runtime. Defaults to "node" if omitted. */
	runtime?: CommandRuntime;
}

/** Standard shape returned after a command execution. */
export interface CommandResult {
	success: boolean;
	command: string | null;
	data?: unknown;
	meta?: {
		duration: number;
		[key: string]: unknown;
	};
	error?: {
		code: string;
		message: string;
	};
	suggestExplore?: boolean;
	driftSuspected?: boolean;
}
