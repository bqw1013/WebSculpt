import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import type { CommandRuntime } from "../../../../types/index.js";
import { scanAllCommands } from "../../../engine/command-discovery/scanner.js";
import { resolveEntryFile } from "../../../runtime/index.js";

/** Objective command-library state captured when a workspace is created. */
export interface CommandLibrarySnapshot {
	totalCommands: number;
	sameDomainCommands: string[];
	nameConflict: boolean;
	conflictSource?: "user" | "builtin";
}

/** Machine-readable metadata stored in capture.yaml. */
export interface CaptureYaml {
	name: string;
	domain: string;
	action: string;
	runtime: CommandRuntime;
	createdAt: string;
	schema: "command-capture";
	commandLibrarySnapshot: CommandLibrarySnapshot;
	repairOf: null;
	sourceCommand: null;
	supersedes: null;
}

/** Identity mismatch found between capture metadata and the draft manifest. */
export interface CaptureDraftIdentityMismatch {
	field: "domain" | "action" | "runtime";
	expected: string;
	actual: unknown;
	message: string;
}

/** Result of reading and checking the draft manifest. */
export interface CaptureDraftManifestInspection {
	content: string;
	invalidReason?: string;
	manifest?: Record<string, unknown>;
	mismatch?: CaptureDraftIdentityMismatch;
}

/**
 * Resolves the absolute path for a named capture workspace.
 */
export function getCaptureWorkspacePath(name: string, baseDir = process.cwd()): string {
	return resolve(baseDir, ".websculpt-captures", name);
}

/**
 * Resolves the absolute path for a capture workspace's draft directory.
 */
export function getCaptureDraftPath(name: string, baseDir = process.cwd()): string {
	return join(getCaptureWorkspacePath(name, baseDir), "draft");
}

/**
 * Reads and validates a capture.yaml document from disk.
 */
export async function readCaptureYaml(filePath: string): Promise<CaptureYaml> {
	const raw = await readFile(filePath, "utf8");
	const parsed: unknown = parse(raw);
	if (!isCaptureYaml(parsed)) {
		throw new Error(`Invalid capture metadata: ${filePath}`);
	}
	return parsed;
}

/**
 * Writes capture metadata as YAML, creating parent directories when needed.
 */
export async function writeCaptureYaml(filePath: string, metadata: CaptureYaml): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, stringify(metadata), "utf8");
}

/**
 * Reads `draft/manifest.json` and compares its identity fields with capture metadata.
 */
export async function inspectCaptureDraftManifest(
	draftPath: string,
	captureYaml: CaptureYaml,
): Promise<CaptureDraftManifestInspection> {
	let content: string;
	try {
		content = await readFile(join(draftPath, "manifest.json"), "utf8");
	} catch {
		return {
			content: "",
			invalidReason: "Manifest file not found",
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(content) as unknown;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		return {
			content,
			invalidReason: `Manifest JSON is invalid: ${message}`,
		};
	}

	if (!isRecord(parsed)) {
		return {
			content,
			invalidReason: "Manifest JSON must be an object",
		};
	}

	return {
		content,
		manifest: parsed,
		mismatch: findCaptureDraftIdentityMismatch(captureYaml, parsed),
	};
}

/**
 * Computes a stable hash for draft files whose contents are covered by validation.
 */
export async function computeCaptureDraftFingerprint(
	name: string,
	captureYaml: CaptureYaml,
	baseDir = process.cwd(),
): Promise<string> {
	const draftPath = getCaptureDraftPath(name, baseDir);
	const files = ["manifest.json", resolveEntryFile(captureYaml.runtime), "README.md", "context.md"];
	const hash = createHash("sha256");

	hash.update(
		JSON.stringify({ domain: captureYaml.domain, action: captureYaml.action, runtime: captureYaml.runtime }),
	);
	hash.update("\0");
	for (const file of files) {
		hash.update(file);
		hash.update("\0");
		try {
			hash.update(await readFile(join(draftPath, file), "utf8"));
		} catch (err: unknown) {
			const code = isNodeError(err) ? err.code : "UNKNOWN";
			hash.update(`missing:${code}`);
		}
		hash.update("\0");
	}

	return hash.digest("hex");
}

/**
 * Scans builtin and user command libraries for same-domain and exact-name conflicts.
 */
export async function scanCommandLibrarySnapshot(domain: string, action: string): Promise<CommandLibrarySnapshot> {
	const commands = await scanAllCommands();
	const sameDomainCommands = [
		...new Set(
			commands
				.filter((command) => command.manifest.domain === domain)
				.map((command) => `${command.manifest.domain}/${command.manifest.action}`),
		),
	].sort();
	const userConflict = commands.some(
		(command) =>
			command.source === "user" && command.manifest.domain === domain && command.manifest.action === action,
	);
	const builtinConflict = commands.some(
		(command) =>
			command.source === "builtin" && command.manifest.domain === domain && command.manifest.action === action,
	);
	const snapshot: CommandLibrarySnapshot = {
		totalCommands: commands.length,
		sameDomainCommands,
		nameConflict: userConflict || builtinConflict,
	};
	if (userConflict) {
		snapshot.conflictSource = "user";
	} else if (builtinConflict) {
		snapshot.conflictSource = "builtin";
	}
	return snapshot;
}

/**
 * Generates the initial evidence document with mandatory audit headings.
 */
export function generateEvidenceTemplate(metadata: CaptureYaml): string {
	return `# Evidence: ${metadata.domain}/${metadata.action}

This document records the research and validation evidence for the \`${metadata.domain}/${metadata.action}\` command.

## Exploration Path

<!-- Record command library overlap checks and the guide or tool contract you consulted. -->

## Verified URLs

<!-- List each URL that was actually visited and used for extraction. -->

## Structural Evidence

<!-- Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

## Parameters and Samples

<!-- Describe parameterizable fields and include at least one input/output sample. -->

## Failure Signals

<!-- Describe known failure modes, dependencies, and drift signals. -->

## Capture Assessment

<!-- State whether this command should be captured and why. -->
`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findCaptureDraftIdentityMismatch(
	captureYaml: CaptureYaml,
	manifest: Record<string, unknown>,
): CaptureDraftIdentityMismatch | undefined {
	const expected = {
		domain: captureYaml.domain,
		action: captureYaml.action,
		runtime: captureYaml.runtime,
	} as const;

	for (const field of ["domain", "action", "runtime"] as const) {
		const actual = manifest[field];
		if (actual !== expected[field]) {
			return {
				field,
				expected: expected[field],
				actual,
				message: `Manifest ${field} ${formatManifestValue(actual)} does not match capture ${field} "${expected[field]}"`,
			};
		}
	}

	return undefined;
}

function formatManifestValue(value: unknown): string {
	if (typeof value === "string") {
		return `"${value}"`;
	}
	if (value === undefined) {
		return "undefined";
	}
	return JSON.stringify(value) ?? String(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
	return typeof value === "object" && value !== null && "code" in value;
}

function isCommandLibrarySnapshot(value: unknown): value is CommandLibrarySnapshot {
	if (!isRecord(value)) return false;
	const conflictSource = value.conflictSource;
	return (
		typeof value.totalCommands === "number" &&
		Array.isArray(value.sameDomainCommands) &&
		value.sameDomainCommands.every((command) => typeof command === "string") &&
		typeof value.nameConflict === "boolean" &&
		(conflictSource === undefined || conflictSource === "user" || conflictSource === "builtin")
	);
}

function isCaptureYaml(value: unknown): value is CaptureYaml {
	if (!isRecord(value)) return false;
	return (
		typeof value.name === "string" &&
		typeof value.domain === "string" &&
		typeof value.action === "string" &&
		typeof value.runtime === "string" &&
		typeof value.createdAt === "string" &&
		value.schema === "command-capture" &&
		isCommandLibrarySnapshot(value.commandLibrarySnapshot) &&
		value.repairOf === null &&
		value.sourceCommand === null &&
		value.supersedes === null
	);
}
