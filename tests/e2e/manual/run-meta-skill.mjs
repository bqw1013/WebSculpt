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
	printHeader("Meta Skill");

	await runStep("skill status (before)", ["skill", "status"]);
	await runStep("skill install", ["skill", "install", "--force"]);
	await runStep("skill status (after install)", ["skill", "status"]);
	await runStep("skill uninstall", ["skill", "uninstall"]);
	await runStep("skill status (after uninstall)", ["skill", "status"]);

	printSummary(stepsTotal, stepsPassed);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
