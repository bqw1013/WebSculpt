import { listAllCommands } from "../engine/registry.js";

/** Lists all registered commands in a tabular format. */
export async function handleCommandList(): Promise<void> {
	const commands = await listAllCommands();
	if (commands.length === 0) {
		console.log("No commands available.");
		return;
	}

	const rows = commands.map((c) => ({
		domain: c.manifest.domain,
		action: c.manifest.action,
		type: c.source,
		id: c.manifest.id,
		description: c.manifest.description || "-",
		path: c.commandPath,
	}));

	// Compute column widths so the table aligns cleanly.
	const typeMax = Math.max(...rows.map((r) => r.type.length), 4);
	const domainMax = Math.max(...rows.map((r) => r.domain.length), 6);
	const actionMax = Math.max(...rows.map((r) => r.action.length), 6);
	const idMax = Math.max(...rows.map((r) => r.id.length), 2);

	const pad = (s: string, n: number) => s.padEnd(n, " ");

	console.log(
		`${pad("Type", typeMax)}  ${pad("Domain", domainMax)}  ${pad("Action", actionMax)}  ${pad("ID", idMax)}  Description`,
	);
	console.log("-".repeat(typeMax + domainMax + actionMax + idMax + 14));

	for (const r of rows) {
		console.log(
			`${pad(r.type, typeMax)}  ${pad(r.domain, domainMax)}  ${pad(r.action, actionMax)}  ${pad(r.id, idMax)}  ${r.description}`,
		);
	}
}

/** Displays details for a specific command. (Not implemented) */
export async function handleCommandShow(domain: string, action: string): Promise<void> {
	console.log(`Command: ${domain}/${action}`);
	console.log("Status: Not implemented yet");
}

/** Removes a user-defined command. (Not implemented) */
export async function handleCommandRemove(domain: string, action: string): Promise<void> {
	console.log(`Command "${domain}/${action}" removed successfully. (Not implemented yet)`);
}
