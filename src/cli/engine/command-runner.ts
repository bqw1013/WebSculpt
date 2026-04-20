import { execFile } from "child_process";
import { readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { pathToFileURL } from "url";
import { promisify } from "util";
import type { CommandManifest } from "../../types/index.js";

const execFileAsync = promisify(execFile);

function buildParams(manifest: CommandManifest, args: Record<string, string>): Record<string, string> {
	const params: Record<string, string> = {};
	for (const param of manifest.parameters || []) {
		const key = typeof param === "string" ? param : param.name;
		if (args[key] !== undefined) {
			params[key] = args[key];
		}
	}
	return params;
}

/**
 * Executes a Node.js command module via dynamic ESM import.
 * The import URL includes a cache-busting query so ESM does not reuse a stale module during development.
 */
async function runNodeCommand(commandPath: string, params: Record<string, string>): Promise<unknown> {
	const module = await import(`${pathToFileURL(commandPath).href}?t=${Date.now()}`);
	const handler = module.default || module.command || module;

	if (typeof handler !== "function") {
		throw new Error(`Command module at ${commandPath} does not export a function`);
	}

	return await handler(params);
}

/**
 * Spawns playwright-cli to execute a browser-automation command.
 * A temporary wrapper file is created because playwright-cli's run-code
 * execution context does not expose Node.js globals such as `process.env`.
 * Params are injected by replacing the `PARAMS_INJECT` placeholder
 * inside the command file with a `const params = {...};` declaration.
 * The JSON result surfaced under "### Result" in stdout is parsed and returned.
 */
async function runPlaywrightCliCommand(commandPath: string, params: Record<string, string>): Promise<unknown> {
	const originalCode = await readFile(commandPath, "utf-8");
	const paramsLine = `const params = ${JSON.stringify(params)};`;
	const wrappedCode = originalCode.replace("/* PARAMS_INJECT */", paramsLine);

	const tmpFile = join(process.cwd(), `.websculpt-tmp-${Date.now()}.js`);
	await writeFile(tmpFile, wrappedCode, "utf-8");

	try {
		const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
		const { stdout } = await execFileAsync(npxCmd, ["playwright-cli", "run-code", "--filename", tmpFile], {
			timeout: 60000,
			shell: process.platform === "win32",
		});

		// Extract the JSON result that follows "### Result" in stdout
		const resultMatch = stdout.match(/### Result\n(.+)/);
		if (resultMatch) {
			return JSON.parse(resultMatch[1].trim());
		}
		throw new Error("No JSON result found in playwright-cli output");
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === "ENOENT") {
			const error = new Error('playwright-cli not found. Install it via "npm install -g playwright-cli".');
			(error as Error & { code: string }).code = "RUNTIME_NOT_FOUND";
			throw error;
		}
		throw err;
	} finally {
		await unlink(tmpFile).catch(() => {});
	}
}

/**
 * Dispatches command execution based on the manifest runtime.
 * New runtimes can be supported by adding cases here without touching the rest of the system.
 */
export async function runCommand(
	manifest: CommandManifest,
	commandPath: string,
	args: Record<string, string>,
): Promise<unknown> {
	const runtime = manifest.runtime || "node";
	const params = buildParams(manifest, args);

	switch (runtime) {
		case "node":
			return await runNodeCommand(commandPath, params);
		case "playwright-cli":
			return await runPlaywrightCliCommand(commandPath, params);
		// Future runtimes can be plugged in below:
		// case "shell": return await runShellCommand(commandPath, params);
		// case "python": return await runPythonCommand(commandPath, params);
		default:
			throw new Error(`Unsupported runtime "${runtime}" for command ${manifest.id}`);
	}
}
