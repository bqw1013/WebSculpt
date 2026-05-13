import type { MetaCommandResult, SkillInstallResult, SkillStatusResult, SkillUninstallResult } from "../types.js";

export function isSkillInstallResult(r: MetaCommandResult): r is SkillInstallResult {
	return r.success && "results" in r && Array.isArray((r as SkillInstallResult).results);
}

export function isSkillUninstallResult(r: MetaCommandResult): r is SkillUninstallResult {
	return r.success && "results" in r && Array.isArray((r as SkillUninstallResult).results);
}

export function renderSkillResults(result: SkillInstallResult | SkillUninstallResult): void {
	const byAgent = new Map<string, Array<{ skill: string; status: string }>>();
	for (const r of result.results) {
		const list = byAgent.get(r.agent) ?? [];
		list.push({ skill: r.skill, status: r.status });
		byAgent.set(r.agent, list);
	}

	for (const [agent, items] of byAgent) {
		console.log(`${agent}:`);
		for (const item of items) {
			console.log(`  ${item.skill}: ${item.status}`);
		}
	}
}

export function isSkillStatusResult(r: MetaCommandResult): r is SkillStatusResult {
	return r.success && "lines" in r && Array.isArray((r as SkillStatusResult).lines);
}

export function renderSkillStatus(result: SkillStatusResult): void {
	for (const line of result.lines) {
		console.log(line);
	}
}
