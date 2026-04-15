/** Defines the metadata and contract for a single WebSculpt command. */
export interface CommandManifest {
	id: string;
	domain: string;
	action: string;
	description?: string;
	parameters?: string[];
	outputSchema?: Record<string, any>;
}

/** Standard shape returned after a command execution. */
export interface CommandResult {
	success: boolean;
	command: string | null;
	data?: any;
	meta?: {
		duration: number;
		[key: string]: any;
	};
	error?: {
		code: string;
		message: string;
	};
	suggestExplore?: boolean;
	driftSuspected?: boolean;
}
