import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
	createIsolatedHome,
	parseJsonOutput,
	removeTempDir,
	runSourceCli,
	websculptPath,
} from "./helpers/cli";

interface ExampleHelloResult {
	command: string;
	data: {
		message: string;
		timestamp: string;
	};
	meta: {
		duration: number;
	};
	success: boolean;
}

interface LogEntry {
	action: string;
	domain: string;
	result: {
		command: string;
		success: boolean;
	};
	time: string;
}

describe("source CLI: example hello", () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		await Promise.all(tempDirs.splice(0).map(async (dirPath) => await removeTempDir(dirPath)));
	});

	it("returns JSON output and appends an execution log entry", async () => {
		const homeDir = await createIsolatedHome();
		tempDirs.push(homeDir);

		const initResult = await runSourceCli(["config", "init"], homeDir);
		expect(initResult.exitCode).toBe(0);

		const result = await runSourceCli(["example", "hello", "--name", "Alice"], homeDir);
		const payload = parseJsonOutput<ExampleHelloResult>(result.stdout);

		expect(result.exitCode).toBe(0);
		expect(result.stderr).toBe("");
		expect(payload).toEqual(
			expect.objectContaining({
				command: "example/hello",
				success: true,
			}),
		);
		expect(payload.data.message).toBe("Hello, Alice!");
		expect(Number.isNaN(Date.parse(payload.data.timestamp))).toBe(false);
		expect(payload.meta.duration).toBeGreaterThanOrEqual(0);

		const logLines = (await readFile(websculptPath(homeDir, "log.jsonl"), "utf8"))
			.trim()
			.split("\n")
			.filter((line) => line.length > 0);
		const logEntry = JSON.parse(logLines.at(-1) ?? "") as LogEntry;

		expect(logLines).toHaveLength(1);
		expect(logEntry).toEqual(
			expect.objectContaining({
				action: "hello",
				domain: "example",
			}),
		);
		expect(logEntry.result).toEqual(
			expect.objectContaining({
				command: "example/hello",
				success: true,
			}),
		);
	});
});
