/** Shape of a per-directory scope configuration file. */
export interface ScopeConfig {
	commands: string[];
}

/** A resolved scope with its absolute file path. */
export interface Scope {
	path: string;
	config: ScopeConfig;
}
