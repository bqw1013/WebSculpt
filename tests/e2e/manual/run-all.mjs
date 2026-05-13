import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

const stages = [
	{ name: "Build", script: null, fn: () => execSync("npm run build", { stdio: "inherit", cwd: repoRoot }) },
	{ name: "Meta Commands", script: "run-meta-command.mjs" },
	{ name: "Meta Scope", script: "run-meta-scope.mjs" },
	{ name: "Meta Daemon", script: "run-meta-daemon.mjs" },
	{ name: "Meta Skill", script: "run-meta-skill.mjs" },
	{ name: "Extension Commands (Parallel)", script: "run-extension-parallel.mjs" },
];

function printBanner(title) {
	const line = "═".repeat(63);
	console.log("");
	console.log(`╔${line}╗`);
	console.log(`║${title.padStart(31 + Math.floor(title.length / 2)).padEnd(63)}║`);
	console.log(`╚${line}╝`);
}

function printStageStart(name, index, total) {
	console.log("");
	console.log(`▶ STAGE ${index + 1}/${total}: ${name}`);
	console.log("───────────────────────────────────────────────────────────────");
}

function printStageEnd(name, passed, durationMs) {
	const duration = durationMs >= 1000 ? `${(durationMs / 1000).toFixed(1)}s` : `${durationMs}ms`;
	const status = passed ? "✓ PASS" : "✗ FAIL";
	console.log("");
	console.log(`${status}  ${name}  (${duration})`);
}

async function run() {
	const startTime = Date.now();
	printBanner("WebSculpt Smoke Check — Full Run");

	const results = [];

	for (let i = 0; i < stages.length; i++) {
		const stage = stages[i];
		printStageStart(stage.name, i, stages.length);
		const stageStart = Date.now();
		let passed = false;
		try {
			if (stage.fn) {
				stage.fn();
			} else {
				execSync(`node ${stage.script}`, { stdio: "inherit", cwd: __dirname });
			}
			passed = true;
		} catch {
			passed = false;
		}
		const duration = Date.now() - stageStart;
		results.push({ name: stage.name, passed, duration });
		printStageEnd(stage.name, passed, duration);
	}

	const totalDuration = Date.now() - startTime;

	// Final summary table
	const line = "═".repeat(63);
	console.log("");
	console.log(`╔${line}╗`);
	console.log(`║${"SUMMARY".padStart(36).padEnd(63)}║`);
	console.log(`╠${line}╣`);
	for (const r of results) {
		const icon = r.passed ? "✓" : "✗";
		const time = r.duration >= 1000 ? `${(r.duration / 1000).toFixed(1)}s` : `${r.duration}ms`;
		const row = `${icon} ${r.name.padEnd(40)} ${time.padStart(14)}`;
		console.log(`║  ${row.padEnd(59)}║`);
	}
	console.log(`╠${line}╣`);
	const passedCount = results.filter((r) => r.passed).length;
	const summary = `${passedCount}/${results.length} stages passed`.padEnd(40);
	const totalTime = `${(totalDuration / 1000).toFixed(1)}s`.padStart(14);
	console.log(`║  ${(summary + totalTime).padEnd(59)}║`);
	console.log(`╚${line}╝`);

	const allPassed = results.every((r) => r.passed);
	process.exit(allPassed ? 0 : 1);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
