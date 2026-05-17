import type { CommandParameter, ValidationDetail } from "../../types/index.js";
import type { CommandLibrarySnapshot } from "../meta/capture/lib/capture-io.js";
import type { ArtifactState } from "../meta/capture/lib/capture-state.js";

/** Output format for meta command results. */
export type OutputFormat = "human" | "json";

/** Normalized error result returned by meta command handlers on failure. */
export interface MetaCommandError {
	success: false;
	error: {
		code: string;
		message: string;
	};
}

/** Result shape for a successful command creation. */
export interface CommandCreateResult {
	success: true;
	command: string;
	path: string;
	warnings?: ValidationDetail[];
}

/** Result shape for a validation error. */
export interface ValidationErrorResult {
	success: false;
	error: {
		code: "VALIDATION_ERROR";
		message: string;
		details: ValidationDetail[];
	};
}

/** Result shape for a successful command validation. */
export interface CommandValidateResult {
	success: true;
	warnings?: ValidationDetail[];
	message?: string;
}

/** Result shape for a successful command removal. */
export interface CommandRemoveResult {
	success: true;
	command: string;
}

/** Result shape for a successful command draft. */
export interface CommandDraftResult {
	success: true;
	draftPath: string;
	files: string[];
	runtime: string;
	nextSteps: Array<{
		action: string;
		file?: string;
		command?: string;
	}>;
	warnings?: ValidationDetail[];
}

/** Result shape for a successful capture workspace creation. */
export interface CaptureNewResult {
	success: true;
	capture: {
		name: string;
		path: string;
		domain: string;
		action: string;
		runtime: string;
	};
	commandLibrarySnapshot: CommandLibrarySnapshot;
	summary: {
		domain: string;
		action: string;
		duplicateWarning?: string;
		estimatedSteps: number;
	};
	next: string;
	warnings?: ValidationDetail[];
}

/** Result shape for a successful explore workspace creation. */
export interface ExploreNewResult {
	success: true;
	explore: {
		name: string;
		path: string;
		intent: string;
	};
	next: string;
}

/** Result shape for a successful explore assess. */
export interface ExploreAssessPassedResult {
	success: true;
	explore: {
		name: string;
		path: string;
	};
	assessment: {
		status: "passed";
		captureEligible: boolean;
		candidate?: string;
	};
	next: string;
}

/** Result shape for a failed explore assess. */
export interface ExploreAssessFailedResult {
	success: false;
	explore: {
		name: string;
		path: string;
	};
	error: {
		code: string;
		message: string;
	};
	audit: {
		missingHeadings: string[];
		emptyHeadings: string[];
		keywordGaps: string[];
	};
}

/** Union of explore assess results. */
export type ExploreAssessResult = ExploreAssessPassedResult | ExploreAssessFailedResult;

/** Result shape for a successful capture status query. */
export interface CaptureStatusResult {
	success: true;
	capture: {
		name: string;
		path: string;
	};
	artifacts: {
		evidence: ArtifactState;
		command: ArtifactState;
		manifest: ArtifactState;
		readme: ArtifactState;
		context: ArtifactState;
		validation: ArtifactState;
	};
	readyToFinalize: boolean;
	next: {
		action: string;
		target?: string;
	};
	warnings?: ValidationDetail[];
}

/** Result shape for a successful command list. */
export interface CommandListResult {
	success: true;
	commands: Array<{
		domain: string;
		action: string;
		type: string;
		id: string;
		description: string;
		requiresBrowser: boolean;
		authRequired?: "required" | "not-required" | "unknown";
	}>;
}

/** Result shape for a successful command show. */
export interface CommandShowResult {
	success: true;
	command: {
		id: string;
		domain: string;
		action: string;
		description: string;
		runtime: string;
		source: string;
		path: string;
		entryFile: string;
		parameters: CommandParameter[];
		prerequisites: string[];
		assets: {
			manifest: boolean;
			readme: boolean;
			context: boolean;
			entryFile: boolean;
		};
		requiresBrowser: boolean;
		authRequired?: "required" | "not-required" | "unknown";
	};
	readmeContent?: string;
}

/** Result shape for a successful config init. */
export interface ConfigInitResult {
	success: true;
	message: string;
}

/** Result shape for a successful scope show. */
export interface ScopeShowResult {
	success: true;
	scopeCommands: Array<{
		command: string;
		valid: boolean;
	}>;
}

/** Result shape for a successful daemon stop. */
export interface DaemonStopResult {
	success: true;
	message: string;
}

/** Runtime health status returned by the daemon health endpoint. */
export interface DaemonHealthStatus {
	pid: number;
	uptime: number;
	healthy: boolean;
	degraded: boolean;
	browser: {
		connected: boolean;
		lazy: boolean;
		pages: number;
	};
	sessions: {
		active: number;
		max: number;
		total: number;
	};
	resources: {
		rssMB: number;
		heapUsedMB: number;
		heapTotalMB: number;
	};
	limits: {
		commandTimeoutSec: number;
		maxConcurrentSessions: number;
		maxTotalPages: number;
		memoryWarningMB: number;
		memoryLimitMB: number;
		restartAfterExecutions: number;
	};
}

/** Result shape for a successful daemon status query. */
export interface DaemonStatusResult {
	success: true;
	status: DaemonHealthStatus;
}

/** Result shape for a successful daemon logs query. */
export interface DaemonLogsResult {
	success: true;
	lines: string[];
}

/** Result shape for a successful daemon start. */
export interface DaemonStartResult {
	success: true;
	message: string;
}

/** Result shape for a successful daemon restart. */
export interface DaemonRestartResult {
	success: true;
	message: string;
}

/** Result shape for a successful skill install. */
export interface SkillInstallResult {
	success: true;
	results: Array<{ agent: string; skill: string; status: "installed" | "skipped" | "replaced" }>;
}

/** Result shape for a successful skill uninstall. */
export interface SkillUninstallResult {
	success: true;
	results: Array<{ agent: string; skill: string; status: "removed" | "not_found" }>;
}

/** Result shape for a successful skill status. */
export interface SkillStatusResult {
	success: true;
	lines: string[];
}

/** Union of all meta command result shapes. */
export type MetaCommandResult =
	| CommandCreateResult
	| CommandRemoveResult
	| CommandListResult
	| ConfigInitResult
	| DaemonStopResult
	| DaemonStatusResult
	| DaemonLogsResult
	| SkillInstallResult
	| SkillUninstallResult
	| SkillStatusResult
	| CommandValidateResult
	| ValidationErrorResult
	| CommandDraftResult
	| CaptureNewResult
	| CaptureStatusResult
	| CommandShowResult
	| ExploreNewResult
	| ExploreAssessResult
	| MetaCommandError;
