import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { printHeader, printSection, printSummary, runSourceCli } from "./_helpers.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const OUTDIR = resolve(REPO_ROOT, ".tmp/manual-extension-parallel");
let stepsTotal = 0;
let stepsPassed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// Launch a CLI command and return a promise that resolves with the result.
// ---------------------------------------------------------------------------
function runBg(label, args) {
	console.log(`[START] ${label}`);
	stepsTotal++;
	return runSourceCli(args).then((result) => ({ label, result }));
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------
async function run() {
	printHeader("Extension Commands (Parallel)");

	printSection("Cleanup output dir");
	await rm(OUTDIR, { recursive: true, force: true });
	await mkdir(OUTDIR, { recursive: true });
	console.log("Result: OK");

	printSection("Ensure daemon is running");
	const startResult = await runSourceCli(["daemon", "start"]);
	if (startResult.stdout) console.log(startResult.stdout.trim());
	console.log("Result: OK");

	console.log("");
	console.log("===============================================================");
	console.log("  Launching commands in parallel...");
	console.log("===============================================================");

	// --- Builtin commands ---
	const promises = [
		runBg("github-list-trending", ["github", "list-trending", "--limit", "3"]),
		runBg("hackernews-list-top", ["hackernews", "list-top", "--limit", "3"]),
		runBg("zhihu-list-hot", ["zhihu", "list-hot", "--limit", "3"]),
		runBg("zhihu-list-posts", ["zhihu", "list-posts", "--user", "https://www.zhihu.com/people/bai-qiang-wei-10", "--limit", "2"]),
		runBg("zhihu-list-activities", ["zhihu", "list-activities", "--user", "https://www.zhihu.com/people/bai-qiang-wei-10", "--limit", "2"]),
		runBg("zhihu-get-post", ["zhihu", "get-post", "--url", "https://zhuanlan.zhihu.com/p/608634079"]),
		runBg("zhihu-get-user-profile", ["zhihu", "get-user-profile", "--user", "https://www.zhihu.com/people/bai-qiang-wei-10"]),

		// --- User commands ---
		runBg("16888-list-sales", ["16888", "list-sales", "--year", "2026", "--month", "3", "--limit", "3"]),
		runBg("cpcaauto-list-sales-rankings", ["cpcaauto", "list-sales-rankings", "--limit", "3"]),

	];

	console.log("");
	console.log("=== Waiting for all background jobs ===");

	const results = await Promise.all(promises);

	for (const { label, result } of results) {
		await writeFile(`${OUTDIR}/${label}.out`, result.stdout, "utf8");
		await writeFile(`${OUTDIR}/${label}.err`, result.stderr, "utf8");

		if (result.exitCode === 0) {
			console.log(`[PASS] ${label}`);
			stepsPassed++;
		} else {
			console.log(`[FAIL] ${label} (exit ${result.exitCode})`);
			failed = 1;
		}
	}

	console.log("");
	console.log("===============================================================");
	console.log("  OUTPUTS");
	console.log("===============================================================");

	for (const { label } of results) {
		const outFile = await readFile(`${OUTDIR}/${label}.out`, "utf8");
		const errFile = await readFile(`${OUTDIR}/${label}.err`, "utf8");

		console.log("");
		console.log(`--- [${label}] ---`);
		console.log(outFile);
		if (errFile) {
			console.log("");
			console.log("[STDERR]:");
			console.log(errFile);
		}
	}

	printSummary(stepsTotal, stepsPassed);

	printSection("Cleanup output dir");
	await rm(OUTDIR, { recursive: true, force: true });
	console.log("Result: OK");

	process.exit(failed);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
