import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ValidationDetail } from "../../../../types/index.js";
import { resolveEntryFile } from "../../../runtime/index.js";
import {
	type CaptureDraftManifestInspection,
	computeCaptureDraftFingerprint,
	inspectCaptureDraftManifest,
} from "./capture-draft.js";
import {
	getCaptureDraftPath,
	getCaptureWorkspacePath,
	readCaptureYaml,
	readValidationRecord,
	swallowENOENT,
	type ValidationRecord,
} from "./capture-io.js";
import { COMMAND_TODO_MARKERS } from "./constants.js";
import { auditEvidence, type EvidenceAuditResult } from "./evidence-audit.js";

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

// ---------------------------------------------------------------------------
// Pure derivation functions
// ---------------------------------------------------------------------------

export function deriveEvidenceState(audit: EvidenceAuditResult): ArtifactState {
	if (audit.passed) {
		return { status: "done", detail: { keywordGaps: audit.keywordGaps } };
	}

	const parts: string[] = [];
	if (audit.missingHeadings.length > 0) {
		parts.push(`Missing headings: ${audit.missingHeadings.join(", ")}`);
	}
	if (audit.emptyHeadings.length > 0) {
		parts.push(`Empty headings: ${audit.emptyHeadings.join(", ")}`);
	}

	return {
		status: "blocked",
		reason: parts.join("; "),
		detail: {
			missingHeadings: audit.missingHeadings,
			emptyHeadings: audit.emptyHeadings,
			keywordGaps: audit.keywordGaps,
		},
	};
}

export function deriveCommandState(
	evidencePassed: boolean,
	manifestMismatchDetail: string | undefined,
	commandContent: string,
): ArtifactState {
	if (!evidencePassed) {
		return { status: "blocked", reason: "Evidence is not complete" };
	}
	if (manifestMismatchDetail !== undefined) {
		return { status: "blocked", reason: manifestMismatchDetail };
	}
	if (commandContent === "") {
		return { status: "blocked", reason: "Command file not found" };
	}
	return isCommandTemplate(commandContent) ? { status: "ready" } : { status: "done" };
}

export function deriveManifestState(
	manifestMismatchDetail: string | undefined,
	commandStatus: ArtifactStatus,
	manifestInspection: CaptureDraftManifestInspection,
): ArtifactState {
	if (manifestMismatchDetail !== undefined) {
		return { status: "blocked", reason: manifestMismatchDetail };
	}
	if (commandStatus !== "done") {
		return { status: "blocked", reason: "Command is not complete" };
	}
	if (manifestInspection.invalidReason !== undefined || manifestInspection.manifest === undefined) {
		return { status: "blocked", reason: manifestInspection.invalidReason ?? "Manifest file not found" };
	}
	if (
		typeof manifestInspection.manifest.description !== "string" ||
		manifestInspection.manifest.description.trim().length === 0
	) {
		return { status: "ready" };
	}
	return { status: "done" };
}

export function deriveReadmeState(
	manifestMismatchDetail: string | undefined,
	manifestStatus: ArtifactStatus,
	readmeContent: string,
): ArtifactState {
	if (manifestMismatchDetail !== undefined) {
		return { status: "blocked", reason: manifestMismatchDetail };
	}
	if (manifestStatus !== "done") {
		return { status: "blocked", reason: "Manifest is not complete" };
	}
	if (readmeContent === "") {
		return { status: "blocked", reason: "README file not found" };
	}
	return isDocumentTemplate(readmeContent) ? { status: "ready" } : { status: "done" };
}

export function deriveContextState(
	manifestMismatchDetail: string | undefined,
	readmeStatus: ArtifactStatus,
	contextContent: string,
): ArtifactState {
	if (manifestMismatchDetail !== undefined) {
		return { status: "blocked", reason: manifestMismatchDetail };
	}
	if (readmeStatus !== "done") {
		return { status: "blocked", reason: "README is not complete" };
	}
	if (contextContent === "") {
		return { status: "blocked", reason: "Context file not found" };
	}
	return isDocumentTemplate(contextContent) ? { status: "ready" } : { status: "done" };
}

export function deriveValidationState(
	manifestMismatchDetail: string | undefined,
	draftArtifactsDone: boolean,
	validationRecord: ValidationRecord | undefined,
	currentFingerprint: string,
): ArtifactState {
	if (manifestMismatchDetail !== undefined) {
		return { status: "blocked", reason: manifestMismatchDetail };
	}
	if (!draftArtifactsDone) {
		return { status: "blocked", reason: "Draft artifacts are not complete" };
	}
	if (validationRecord === undefined) {
		return { status: "blocked", reason: "Run `capture validate`" };
	}
	if (validationRecord.success !== true) {
		return {
			status: "blocked",
			reason: "Last validation failed",
			detail: { lastResult: "failed" },
		};
	}
	if (validationRecord.draftFingerprint !== currentFingerprint) {
		return {
			status: "blocked",
			reason: "Draft changed after last validation",
			detail: { lastResult: "stale" },
		};
	}
	return { status: "done" };
}

// ---------------------------------------------------------------------------
// Next-action strategy table
// ---------------------------------------------------------------------------

interface NextActionRule {
	predicate: (artifacts: CaptureArtifactsStatus, mismatch?: string) => boolean;
	action: string;
	target?: string;
	targetResolver?: (runtime: string) => string;
}

const NEXT_ACTION_RULES: NextActionRule[] = [
	{
		predicate: (a) => a.evidence.status !== "done",
		action: "fill-evidence",
		target: "evidence.md",
	},
	{
		predicate: (_, m) => m !== undefined,
		action: "fill-manifest",
		target: "manifest.json",
	},
	{
		predicate: (a) => a.command.status !== "done",
		action: "fill-command",
		targetResolver: resolveEntryFile,
	},
	{
		predicate: (a) => a.manifest.status !== "done",
		action: "fill-manifest",
		target: "manifest.json",
	},
	{
		predicate: (a) => a.readme.status !== "done",
		action: "fill-readme",
		target: "README.md",
	},
	{
		predicate: (a) => a.context.status !== "done",
		action: "fill-context",
		target: "context.md",
	},
	{
		predicate: (a) => a.validation.status !== "done",
		action: "validate",
	},
];

export function deriveNextAction(
	artifacts: CaptureArtifactsStatus,
	runtime: string,
	manifestMismatchDetail?: string,
): { nextAction: string; nextTarget?: string } {
	for (const rule of NEXT_ACTION_RULES) {
		if (rule.predicate(artifacts, manifestMismatchDetail)) {
			const target = rule.targetResolver ? rule.targetResolver(runtime) : rule.target;
			return { nextAction: rule.action, nextTarget: target };
		}
	}
	return { nextAction: "request-user-confirmation" };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

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
	const entryFile = resolveEntryFile(runtime);

	// Evidence
	const evidenceContent = await readFile(join(workspacePath, "evidence.md"), "utf8");
	const evidenceAudit = auditEvidence(evidenceContent, runtime);
	const evidenceState = deriveEvidenceState(evidenceAudit);

	// Manifest inspection (used by multiple artifacts)
	const manifestInspection = await inspectCaptureDraftManifest(draftPath, captureYaml);
	const manifestMismatchDetail = manifestInspection.mismatch?.message;

	// Command
	const commandContent = (await readFile(join(draftPath, entryFile), "utf8").catch(swallowENOENT)) ?? "";
	const commandState = deriveCommandState(evidenceAudit.passed, manifestMismatchDetail, commandContent);

	// Manifest
	const manifestState = deriveManifestState(manifestMismatchDetail, commandState.status, manifestInspection);

	// README
	const readmeContent = (await readFile(join(draftPath, "README.md"), "utf8").catch(swallowENOENT)) ?? "";
	const readmeState = deriveReadmeState(manifestMismatchDetail, manifestState.status, readmeContent);

	// Context
	const contextContent = (await readFile(join(draftPath, "context.md"), "utf8").catch(swallowENOENT)) ?? "";
	const contextState = deriveContextState(manifestMismatchDetail, readmeState.status, contextContent);

	// Validation
	const draftArtifactsDone =
		commandState.status === "done" &&
		manifestState.status === "done" &&
		readmeState.status === "done" &&
		contextState.status === "done";
	const validationRecord = await readValidationRecord(workspacePath);
	const currentFingerprint = await computeCaptureDraftFingerprint(name, captureYaml, baseDir);
	const validationState = deriveValidationState(
		manifestMismatchDetail,
		draftArtifactsDone,
		validationRecord,
		currentFingerprint,
	);

	const artifacts: CaptureArtifactsStatus = {
		evidence: evidenceState,
		command: commandState,
		manifest: manifestState,
		readme: readmeState,
		context: contextState,
		validation: validationState,
	};

	const { nextAction, nextTarget } = deriveNextAction(artifacts, runtime, manifestMismatchDetail);

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
		artifacts,
		readyToFinalize,
		nextAction,
		nextTarget,
		warnings,
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCommandTemplate(content: string): boolean {
	return COMMAND_TODO_MARKERS.some((marker) => content.includes(marker));
}

function isDocumentTemplate(content: string): boolean {
	return content.includes("TODO:");
}
