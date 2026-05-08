import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import type { CommandRuntime } from "../../../../types/index.js";
import { scanAllCommands } from "../../../engine/command-discovery/scanner.js";

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
 * Generates the initial evidence document with mandatory audit headings and snapshot context.
 */
export function generateEvidenceTemplate(metadata: CaptureYaml): string {
	const snapshot = metadata.commandLibrarySnapshot;
	const sameDomain =
		snapshot.sameDomainCommands.length > 0
			? snapshot.sameDomainCommands.map((command) => `- ${command}`).join("\n")
			: "- none";
	const conflictSource = snapshot.conflictSource ?? "none";

	return `# Evidence: ${metadata.domain}/${metadata.action}

<!-- TODO: evidence - remove this line after completing the evidence. -->
<!--
Command library snapshot captured by capture new:
- totalCommands: ${snapshot.totalCommands}
- sameDomainCommands:
${sameDomain}
- nameConflict: ${snapshot.nameConflict}
- conflictSource: ${conflictSource}
-->

## 探索路径

### 命令库查重
<!-- Required. Use the snapshot above to record overlap checks and conclusions. -->

### 工具与 Guide
<!-- Required for browser runtime. Record the guide or tool contract you consulted. -->

## 已验证 URL
<!-- Required. List each URL that was actually visited and used for extraction. -->

## 结构证据
<!-- Required. Record DOM selectors, JSON fields, API shapes, or other structural facts. -->

## 参数与样例
<!-- Required. Describe parameterizable fields and include at least one input/output sample. -->

## 失败信号
<!-- Required. Describe known failure modes, dependencies, and drift signals. -->

## Capture Assessment
<!-- Required. State whether this should be captured and why. -->
`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
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
