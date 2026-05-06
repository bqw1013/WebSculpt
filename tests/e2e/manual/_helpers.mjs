import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const tsxCliPath = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
const sourceCliEntry = join(repoRoot, "src", "cli", "index.ts");

function createHomeEnv(homeDir) {
	const drive = /^[A-Za-z]:/.exec(parse(homeDir).root)?.[0];
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
export async function createIsolatedHome() {
	return await mkdtemp(join(tmpdir(), "websculpt-smoke-"));
}

/**
 * Removes a temporary directory tree created for a CLI test.
 */
export async function removeTempDir(dirPath) {
	await rm(dirPath, { force: true, recursive: true });
}

/**
 * Returns a path inside the CLI's user data directory for a specific fake home.
 */
export function websculptPath(homeDir, ...parts) {
	return join(homeDir, ".websculpt", ...parts);
}

/**
 * Executes the source-form CLI through tsx and captures its process result.
 * When homeDir is omitted, uses the current process environment.
 */
export async function runSourceCli(args, homeDir) {
	const cliEnv = homeDir
		? { ...process.env, ...createHomeEnv(homeDir) }
		: process.env;

	return new Promise((resolveResult, reject) => {
		const child = spawn(process.execPath, [tsxCliPath, sourceCliEntry, ...args], {
			cwd: repoRoot,
			env: cliEnv,
			windowsHide: true,
		});

		let stdout = "";
		let stderr = "";

		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");

		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});

		child.stderr.on("data", (chunk) => {
			stderr += chunk;
		});

		child.on("error", reject);
		child.on("close", (exitCode) => {
			resolveResult({ exitCode, stderr, stdout });
		});
	});
}

/**
 * Parses a CLI stdout payload that is expected to be a single JSON document.
 */
export function parseJsonOutput(stdout) {
	return JSON.parse(stdout.trim());
}

/**
 * Reads and parses a JSON file from disk.
 */
export async function readJsonFile(filePath) {
	const raw = await readFile(filePath, "utf8");
	return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Smoke-check output helpers
// ---------------------------------------------------------------------------

export function printHeader(title) {
	console.log("===============================================================");
	console.log(` WebSculpt Smoke Check — ${title}`);
	console.log(` Started: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`);
	console.log("===============================================================");
}

export function printSection(name) {
	console.log("");
	console.log(`[${name}]`);
	console.log("---------------------------------------------------------------");
}

export function printSummary(stepsTotal, stepsPassed) {
	console.log("");
	console.log("===============================================================");
	console.log(" SUMMARY");
	console.log("===============================================================");
	console.log(`Steps:  ${stepsTotal}`);
	console.log(`Passed: ${stepsPassed}`);
	console.log(`Failed: ${stepsTotal - stepsPassed}`);
}
