import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ValidationDetail } from "../../../../types/index.js";
import { resolveEntryFile } from "../../../runtime/index.js";
import {
	computeCaptureDraftFingerprint,
	getCaptureDraftPath,
	getCaptureWorkspacePath,
	inspectCaptureDraftManifest,
	readCaptureYaml,
} from "./capture-utils.js";
import { auditEvidence } from "./evidence-audit.js";

export type ArtifactStatus = "blocked" | "ready" | "done";

export interface ArtifactState {
	status: ArtifactStatus;
	reason?: string;
	detail?: Record<string, unknown>;
}

export interface CaptureArtifactsStatus {
	evidence: ArtifactState;
	command: ArtifactState;
	manifest: ArtifactState;
	readme: ArtifactState;
	context: ArtifactState;
	validation: ArtifactState;
}

export interface CaptureStatusData {
	artifacts: CaptureArtifactsStatus;
	readyToFinalize: boolean;
	nextAction: string;
	nextTarget?: string;
	warnings?: ValidationDetail[];
}

/** Markers that indicate the command entry file is still a template. */
const COMMAND_TODO_MARKERS = ["TODO: implement command logic", "TODO: implement command logic using page"];

function isCommandTemplate(content: string): boolean {
	return COMMAND_TODO_MARKERS.some((marker) => content.includes(marker));
}

function isDocumentTemplate(content: string): boolean {
	return content.includes("TODO:");
}

/**
 * Pure-functional state machine that reads a capture workspace from disk and
 * computes the current state of all artifacts plus the next recommended action.
 *
 * @param name - Capture workspace name
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Computed status with artifact states and next action
 */
export async function computeCaptureStatus(name: string, baseDir = process.cwd()): Promise<CaptureStatusData> {
	const workspacePath = getCaptureWorkspacePath(name, baseDir);
	const captureYaml = await readCaptureYaml(join(workspacePath, "capture.yaml"));
	const runtime = captureYaml.runtime;
	const draftPath = getCaptureDraftPath(name, baseDir);

	// -----------------------------------------------------------------------
	// Evidence
	// -----------------------------------------------------------------------
	const evidenceContent = await readFile(join(workspacePath, "evidence.md"), "utf8");
	const evidenceAudit = auditEvidence(evidenceContent, runtime);

	const evidenceReason = ((): string | undefined => {
		const parts: string[] = [];
		if (evidenceAudit.missingHeadings.length > 0) {
			parts.push(`Missing headings: ${evidenceAudit.missingHeadings.join(", ")}`);
		}
		if (evidenceAudit.emptyHeadings.length > 0) {
			parts.push(`Empty headings: ${evidenceAudit.emptyHeadings.join(", ")}`);
		}
		return parts.length > 0 ? parts.join("; ") : undefined;
	})();

	const evidenceState: ArtifactState = evidenceAudit.passed
		? { status: "done", detail: { keywordGaps: evidenceAudit.keywordGaps } }
		: {
				status: "blocked",
				reason: evidenceReason,
				detail: {
					missingHeadings: evidenceAudit.missingHeadings,
					emptyHeadings: evidenceAudit.emptyHeadings,
					keywordGaps: evidenceAudit.keywordGaps,
				},
			};

	// -----------------------------------------------------------------------
	// Manifest mismatch check (affects command, manifest, readme, context)
	// -----------------------------------------------------------------------
	const manifestInspection = await inspectCaptureDraftManifest(draftPath, captureYaml);
	const manifestMismatchDetail = manifestInspection.mismatch?.message;
	const manifestInvalidReason = manifestInspection.invalidReason;

	// -----------------------------------------------------------------------
	// Command
	// -----------------------------------------------------------------------
	const entryFile = resolveEntryFile(runtime);
	const commandPath = join(draftPath, entryFile);
	let commandContent = "";
	try {
		commandContent = await readFile(commandPath, "utf8");
	} catch {
		// handled below
	}

	const commandState: ArtifactState = (() => {
		if (!evidenceAudit.passed) {
			return { status: "blocked", reason: "Evidence is not complete" };
		}
		if (manifestMismatchDetail !== undefined) {
			return { status: "blocked", reason: manifestMismatchDetail };
		}
		if (commandContent === "") {
			return { status: "blocked", reason: "Command file not found" };
		}
		return isCommandTemplate(commandContent) ? { status: "ready" } : { status: "done" };
	})();

	// -----------------------------------------------------------------------
	// Manifest
	// -----------------------------------------------------------------------
	const manifestState: ArtifactState = (() => {
		if (manifestMismatchDetail !== undefined) {
			return { status: "blocked", reason: manifestMismatchDetail };
		}
		if (commandState.status !== "done") {
			return { status: "blocked", reason: "Command is not complete" };
		}
		if (manifestInvalidReason !== undefined || manifestInspection.manifest === undefined) {
			return { status: "blocked", reason: manifestInvalidReason ?? "Manifest file not found" };
		}
		if (
			typeof manifestInspection.manifest.description !== "string" ||
			manifestInspection.manifest.description.trim().length === 0
		) {
			return { status: "ready" };
		}
		return { status: "done" };
	})();

	// -----------------------------------------------------------------------
	// README
	// -----------------------------------------------------------------------
	const readmePath = join(draftPath, "README.md");
	let readmeContent = "";
	try {
		readmeContent = await readFile(readmePath, "utf8");
	} catch {
		// handled below
	}

	const readmeState: ArtifactState = (() => {
		if (manifestMismatchDetail !== undefined) {
			return { status: "blocked", reason: manifestMismatchDetail };
		}
		if (manifestState.status !== "done") {
			return { status: "blocked", reason: "Manifest is not complete" };
		}
		if (readmeContent === "") {
			return { status: "blocked", reason: "README file not found" };
		}
		return isDocumentTemplate(readmeContent) ? { status: "ready" } : { status: "done" };
	})();

	// -----------------------------------------------------------------------
	// Context
	// -----------------------------------------------------------------------
	const contextPath = join(draftPath, "context.md");
	let contextContent = "";
	try {
		contextContent = await readFile(contextPath, "utf8");
	} catch {
		// handled below
	}

	const contextState: ArtifactState = (() => {
		if (manifestMismatchDetail !== undefined) {
			return { status: "blocked", reason: manifestMismatchDetail };
		}
		if (readmeState.status !== "done") {
			return { status: "blocked", reason: "README is not complete" };
		}
		if (contextContent === "") {
			return { status: "blocked", reason: "Context file not found" };
		}
		return isDocumentTemplate(contextContent) ? { status: "ready" } : { status: "done" };
	})();

	// -----------------------------------------------------------------------
	// Validation
	// -----------------------------------------------------------------------
	let validationState: ArtifactState;
	const draftArtifactsDone =
		commandState.status === "done" &&
		manifestState.status === "done" &&
		readmeState.status === "done" &&
		contextState.status === "done";

	if (manifestMismatchDetail !== undefined) {
		validationState = {
			status: "blocked",
			reason: manifestMismatchDetail,
		};
	} else if (!draftArtifactsDone) {
		validationState = {
			status: "blocked",
			reason: "Draft artifacts are not complete",
		};
	} else {
		try {
			const validationJson = await readFile(join(workspacePath, "validation.json"), "utf8");
			const validationRecord = JSON.parse(validationJson) as { draftFingerprint?: unknown; success?: unknown };
			if (validationRecord.success !== true) {
				validationState = {
					status: "blocked",
					reason: "Last validation failed",
					detail: { lastResult: "failed" },
				};
			} else if (
				validationRecord.draftFingerprint !== (await computeCaptureDraftFingerprint(name, captureYaml, baseDir))
			) {
				validationState = {
					status: "blocked",
					reason: "Draft changed after last validation",
					detail: { lastResult: "stale" },
				};
			} else {
				validationState = { status: "done" };
			}
		} catch {
			validationState = {
				status: "blocked",
				reason: "Run `capture validate`",
			};
		}
	}

	// -----------------------------------------------------------------------
	// Next action derivation
	// -----------------------------------------------------------------------
	let nextAction = "request-user-confirmation";
	let nextTarget: string | undefined;

	if (evidenceState.status !== "done") {
		nextAction = "fill-evidence";
		nextTarget = "evidence.md";
	} else if (manifestMismatchDetail !== undefined) {
		nextAction = "fill-manifest";
		nextTarget = "manifest.json";
	} else if (commandState.status !== "done") {
		nextAction = "fill-command";
		nextTarget = entryFile;
	} else if (manifestState.status !== "done") {
		nextAction = "fill-manifest";
		nextTarget = "manifest.json";
	} else if (readmeState.status !== "done") {
		nextAction = "fill-readme";
		nextTarget = "README.md";
	} else if (contextState.status !== "done") {
		nextAction = "fill-context";
		nextTarget = "context.md";
	} else if (validationState.status !== "done") {
		nextAction = "validate";
	}

	const readyToFinalize =
		evidenceState.status === "done" &&
		commandState.status === "done" &&
		manifestState.status === "done" &&
		readmeState.status === "done" &&
		contextState.status === "done" &&
		validationState.status === "done";

	const warnings: ValidationDetail[] | undefined =
		evidenceAudit.keywordGaps.length > 0
			? evidenceAudit.keywordGaps.map((gap) => ({
					code: gap.toUpperCase().replace(/-/g, "_"),
					message: `Keyword gap: ${gap}`,
					level: "warning" as const,
				}))
			: undefined;

	return {
		artifacts: {
			evidence: evidenceState,
			command: commandState,
			manifest: manifestState,
			readme: readmeState,
			context: contextState,
			validation: validationState,
		},
		readyToFinalize,
		nextAction,
		nextTarget,
		warnings,
	};
}
