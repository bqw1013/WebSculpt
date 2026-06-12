import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import type { ValidationDetail } from "../../../../types/index.js";
import { scanAllCommands } from "../../../engine/command-discovery/scanner.js";
import { CAPTURE_DIR, WORKSPACE_ROOT } from "../../shared.js";

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
	runtime: string;
	createdAt: string;
	schema: "command-capture";
	commandLibrarySnapshot: CommandLibrarySnapshot;
	repairOf: null;
	sourceCommand: string | null;
	/** Set by `capture import` to record where the command was resolved from. */
	sourceType?: "user" | "builtin";
	supersedes: null;
}

/** Persisted result of a validation run. */
export interface ValidationRecord {
	success: boolean;
	draftFingerprint?: string;
	timestamp: string;
	warnings?: ValidationDetail[];
	errors?: ValidationDetail[];
}

/**
 * Resolves the absolute path for a named capture workspace.
 */
export function getCaptureWorkspacePath(name: string, baseDir = process.cwd()): string {
	return resolve(baseDir, WORKSPACE_ROOT, CAPTURE_DIR, name);
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
 * Reads and validates a validation.json record from disk.
 * Returns undefined when the file is missing; rethrows all other errors.
 */
export async function readValidationRecord(workspacePath: string): Promise<ValidationRecord | undefined> {
	try {
		const raw = await readFile(join(workspacePath, "validation.json"), "utf8");
		const parsed: unknown = JSON.parse(raw);
		if (!isValidationRecord(parsed)) {
			return undefined;
		}
		return parsed;
	} catch (err: unknown) {
		if (isNodeError(err) && err.code === "ENOENT") {
			return undefined;
		}
		throw err;
	}
}

/**
 * Writes a validation record to validation.json in the workspace root.
 */
export async function writeValidationRecord(workspacePath: string, record: ValidationRecord): Promise<void> {
	await writeFile(join(workspacePath, "validation.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
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

/** Rethrows every error except ENOENT. */
export function swallowENOENT(err: unknown): never | undefined {
	if (isNodeError(err) && err.code === "ENOENT") {
		return undefined;
	}
	throw err;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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

function isValidationRecord(value: unknown): value is ValidationRecord {
	if (!isRecord(value)) return false;
	return (
		typeof value.success === "boolean" &&
		(value.draftFingerprint === undefined || typeof value.draftFingerprint === "string") &&
		typeof value.timestamp === "string" &&
		(value.warnings === undefined || Array.isArray(value.warnings)) &&
		(value.errors === undefined || Array.isArray(value.errors))
	);
}

function isCaptureYaml(value: unknown): value is CaptureYaml {
	if (!isRecord(value)) return false;
	const sourceType = value.sourceType;
	return (
		typeof value.name === "string" &&
		typeof value.domain === "string" &&
		typeof value.action === "string" &&
		typeof value.runtime === "string" &&
		typeof value.createdAt === "string" &&
		value.schema === "command-capture" &&
		isCommandLibrarySnapshot(value.commandLibrarySnapshot) &&
		value.repairOf === null &&
		(value.sourceCommand === null || typeof value.sourceCommand === "string") &&
		(sourceType === undefined || sourceType === "user" || sourceType === "builtin") &&
		value.supersedes === null
	);
}
