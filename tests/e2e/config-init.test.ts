import { readdir } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createIsolatedHome, readJsonFile, removeTempDir, runSourceCli, websculptPath } from "./helpers/cli";

describe("source CLI: config init", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("creates the WebSculpt home, command directory, and default config", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const result = await runSourceCli(["config", "init"], homeDir);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(result.stdout).toContain("WebSculpt initialized.");

		const config = await readJsonFile<{ version: string }>(websculptPath(homeDir, "config.json"));
		const commandEntries = await readdir(websculptPath(homeDir, "commands"));

		expect(config).toEqual(
			expect.objectContaining({
				version: "1",
			}),
		);
		expect(commandEntries).toEqual([]);
	});
});
