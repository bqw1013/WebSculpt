import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface CliRunResult {
	exitCode: number | null;
	stderr: string;
	stdout: string;
}

const helperDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(helperDir, "..", "..", "..");
const tsxCliPath = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const sourceCliEntry = join(repoRoot, "src", "cli", "index.ts");

function createHomeEnv(homeDir: string): NodeJS.ProcessEnv {
	const parsedPath = parse(homeDir);
	const drive = /^[A-Za-z]:/.exec(parsedPath.root)?.[0];

	return {
		HOME: homeDir,
		HOMEDRIVE: drive,
		HOMEPATH: drive ? homeDir.slice(drive.length) : homeDir,
		USERPROFILE: homeDir,
	};
}

/**
 * Creates an isolated home directory so each CLI test can control its own ~/.websculpt state.
 */
export async function createIsolatedHome(): Promise<string> {
	return await mkdtemp(join(tmpdir(), "websculpt-e2e-"));
}

/**
 * Removes a temporary directory tree created for a CLI test.
 */
export async function removeTempDir(dirPath: string): Promise<void> {
	await rm(dirPath, { force: true, recursive: true });
}

/**
 * Returns a path inside the CLI's user data directory for a specific fake home.
 */
export function websculptPath(homeDir: string, ...parts: string[]): string {
	return join(homeDir, ".websculpt", ...parts);
}

/**
 * Executes the source-form CLI through tsx and captures its process result.
 */
export async function runSourceCli(args: string[], homeDir: string): Promise<CliRunResult> {
	const cliEnv: NodeJS.ProcessEnv = {
		...process.env,
		...createHomeEnv(homeDir),
	};

	return await new Promise<CliRunResult>((resolveResult, reject) => {
		const child = spawn(process.execPath, [tsxCliPath, sourceCliEntry, ...args], {
			cwd: repoRoot,
			env: cliEnv,
			windowsHide: true,
		});

		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});

		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});

		child.on("error", reject);
		child.on("close", (exitCode) => {
			resolveResult({
				exitCode,
				stderr,
				stdout,
			});
		});
	});
}

/**
 * Parses a CLI stdout payload that is expected to be a single JSON document.
 */
export function parseJsonOutput<T>(stdout: string): T {
	return JSON.parse(stdout.trim()) as T;
}

/**
 * Reads and parses a JSON file from disk.
 */
export async function readJsonFile<T>(filePath: string): Promise<T> {
	const raw = await readFile(filePath, "utf8");
	return JSON.parse(raw) as T;
}
