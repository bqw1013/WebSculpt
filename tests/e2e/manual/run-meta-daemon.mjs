import { printHeader, printSection, printSummary, runSourceCli } from "./_helpers.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
let stepsTotal = 0;
let stepsPassed = 0;

// ---------------------------------------------------------------------------
// Step helper
// ---------------------------------------------------------------------------
async function runStep(name, args) {
	stepsTotal++;
	printSection(name);
	const result = await runSourceCli(args);
	if (result.stdout) console.log(result.stdout);
	if (result.stderr) console.error(result.stderr);
	if (result.exitCode === 0) {
		stepsPassed++;
		console.log("Result: OK");
	} else {
		console.log(`Result: FAIL (exit ${result.exitCode})`);
	}
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------
async function run() {
	printHeader("Meta Daemon");

	await runStep("daemon status", ["daemon", "status"]);
	await runStep("daemon logs", ["daemon", "logs", "--lines", "20"]);
	await runStep("daemon start", ["daemon", "start"]);
	await runStep("daemon status after start", ["daemon", "status"]);
	await runStep("daemon restart", ["daemon", "restart"]);
	await runStep("daemon status after restart", ["daemon", "status"]);
	await runStep("daemon stop", ["daemon", "stop"]);
	await runStep("daemon status after stop", ["daemon", "status"]);

	printSummary(stepsTotal, stepsPassed);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
