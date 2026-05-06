import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliRunResult } from "./cli";
import { parseJsonOutput, runSourceCli } from "./cli";

export interface CommandParameter {
	name: string;
	description?: string;
	required?: boolean;
	default?: string | number | boolean;
}

export interface CommandManifest {
	action: string;
	description: string;
	domain: string;
	id: string;
	parameters?: CommandParameter[];
	runtime?: "node";
	requiresBrowser: boolean;
	authRequired?: "required" | "not-required" | "unknown";
}

export interface CommandPackageBody {
	code: string;
	manifest: CommandManifest;
}

export interface CommandCreateResult {
	command?: string;
	error?: {
		code: string;
		message: string;
		details?: Array<{ code: string; message: string; level: string }>;
	};
	path?: string;
	success: boolean;
	warnings?: Array<{ code: string; message: string; level: string }>;
}

export interface CommandRemoveResult {
	command?: string;
	error?: {
		code: string;
		message: string;
	};
	success: boolean;
}

export interface RegistryIndex {
	formatVersion: number;
	appVersion: string;
	generatedAt: string;
	commands: Array<{
		manifest: CommandManifest;
		source: "user" | "builtin";
		runtime: string;
	}>;
}

export interface RegisteredUserCommand {
	createPayload: CommandCreateResult;
	createResult: CliRunResult;
}

export const notesSavePackage: CommandPackageBody = {
	code: 'export default async function(params) { return { saved: true, title: params.title ?? "untitled" }; }\n',
	manifest: {
		action: "save",
		description: "Save a note",
		domain: "notes",
		id: "notes-save",
		parameters: [{ name: "title", description: "Note title" }],
		runtime: "node",
		requiresBrowser: false,
	},
};

export const notesDeletePackage: CommandPackageBody = {
	code: "export default async function() { return { deleted: true }; }\n",
	manifest: {
		action: "delete",
		description: "Delete a note",
		domain: "notes",
		id: "notes-delete",
		parameters: [],
		runtime: "node",
		requiresBrowser: false,
	},
};

export const reservedSyncPackage: CommandPackageBody = {
	code: "export default async function() { return { ok: true }; }\n",
	manifest: {
		action: "sync",
		description: "Should not be created",
		domain: "command",
		id: "command-sync",
		parameters: [],
		runtime: "node",
		requiresBrowser: false,
	},
};

/**
 * Writes a command package (manifest + entry file) into a temporary directory.
 */
export async function writeCommandDir(
	homeDir: string,
	dirName: string,
	packageBody: CommandPackageBody,
): Promise<string> {
	const commandDirPath = join(homeDir, dirName);
	await mkdir(commandDirPath, { recursive: true });
	await writeFile(join(commandDirPath, "manifest.json"), JSON.stringify(packageBody.manifest, null, 2), "utf8");
	await writeFile(join(commandDirPath, "command.js"), packageBody.code, "utf8");
	return commandDirPath;
}

/**
 * Registers a user command by writing its package and running `command create`.
 */
export async function registerUserCommand(
	homeDir: string,
	dirName: string,
	packageBody: CommandPackageBody,
): Promise<RegisteredUserCommand> {
	const commandDirPath = await writeCommandDir(homeDir, dirName, packageBody);
	const createResult = await runSourceCli(
		[
			"command",
			"create",
			packageBody.manifest.domain,
			packageBody.manifest.action,
			"--from-dir",
			commandDirPath,
			"--format",
			"json",
		],
		homeDir,
	);

	return {
		createPayload: parseJsonOutput<CommandCreateResult>(createResult.stdout),
		createResult,
	};
}
