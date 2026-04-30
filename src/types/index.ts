/** Supported execution runtimes for a command entry. */
export type CommandRuntime = "node" | "shell" | "python" | "playwright-cli";

/** Defines a single parameter for an extension command. */
export interface CommandParameter {
	name: string;
	description?: string;
	required?: boolean;
	default?: string | number | boolean;
}

/** Defines the metadata and contract for a single WebSculpt command. */
export interface CommandManifest {
	id: string;
	domain: string;
	action: string;
	description: string;
	parameters?: CommandParameter[];
	/** Execution runtime. Defaults to "node" if omitted. */
	runtime?: CommandRuntime;
	/** Optional command-specific prerequisites (e.g., "Requires user login"). */
	prerequisites?: string[];
}

/** A single validation detail emitted by the layered validation system. */
export interface ValidationDetail {
	code: string;
	message: string;
	level: "error" | "warning";
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
