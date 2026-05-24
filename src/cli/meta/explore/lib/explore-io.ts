import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { EXPLORE_DIR, WORKSPACE_ROOT } from "../../shared.js";

/** Machine-readable metadata stored in explore.yaml. */
export interface ExploreYaml {
	name: string;
	intent: string;
	createdAt: string;
	schema: "explore-trace";
	assessment?: {
		status: "passed" | "failed";
		captureEligible: boolean;
		candidate?: string;
		timestamp: string;
	};
}

/**
 * Resolves the absolute path for a named explore workspace.
 */
export function getExploreWorkspacePath(name: string, baseDir = process.cwd()): string {
	return resolve(baseDir, WORKSPACE_ROOT, EXPLORE_DIR, name);
}

/**
 * Reads and validates an explore.yaml document from disk.
 */
export async function readExploreYaml(filePath: string): Promise<ExploreYaml> {
	const raw = await readFile(filePath, "utf8");
	const parsed: unknown = parse(raw);
	if (!isExploreYaml(parsed)) {
		throw new Error(`Invalid explore metadata: ${filePath}`);
	}
	return parsed;
}

/**
 * Writes explore metadata as YAML, creating parent directories when needed.
 */
export async function writeExploreYaml(filePath: string, metadata: ExploreYaml): Promise<void> {
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, stringify(metadata), "utf8");
}

/**
 * Reads the trace.md content from an explore workspace.
 * Returns undefined when the file is missing; rethrows all other errors.
 */
export async function readTraceMd(workspacePath: string): Promise<string | undefined> {
	try {
		return await readFile(join(workspacePath, "trace.md"), "utf8");
	} catch (err: unknown) {
		if (isNodeError(err) && err.code === "ENOENT") {
			return undefined;
		}
		throw err;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
	return typeof value === "object" && value !== null && "code" in value;
}

function isExploreYaml(value: unknown): value is ExploreYaml {
	if (!isRecord(value)) return false;
	return (
		typeof value.name === "string" &&
		typeof value.intent === "string" &&
		typeof value.createdAt === "string" &&
		value.schema === "explore-trace" &&
		(value.assessment === undefined || isAssessment(value.assessment))
	);
}

function isAssessment(value: unknown): value is ExploreYaml["assessment"] {
	if (!isRecord(value)) return false;
	return (
		(value.status === "passed" || value.status === "failed") &&
		typeof value.captureEligible === "boolean" &&
		(value.candidate === undefined || typeof value.candidate === "string") &&
		typeof value.timestamp === "string"
	);
}
