import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

function runStage(name, script) {
	console.log("");
	console.log(`[STAGE] ${name}`);
	console.log("---------------------------------------------------------------");
	execSync(`node ${script}`, { stdio: "inherit", cwd: __dirname });
}

console.log("===============================================================");
console.log(" WebSculpt Smoke Check — Full Run");
console.log(` Started: ${new Date().toISOString().replace("T", " ").slice(0, 19)}`);
console.log("===============================================================");

console.log("");
console.log("[STAGE 1/5] npm run build");
console.log("---------------------------------------------------------------");
execSync("npm run build", { stdio: "inherit", cwd: repoRoot });

runStage("Meta Commands", "run-meta-command.mjs");
runStage("Meta Daemon", "run-meta-daemon.mjs");
runStage("Meta Skill", "run-meta-skill.mjs");
runStage("Extension Commands (Parallel)", "run-extension-parallel.mjs");

console.log("");
console.log("===============================================================");
console.log(" ALL STAGES COMPLETE");
console.log("===============================================================");
