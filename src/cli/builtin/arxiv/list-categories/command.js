// Helper: parse the static category taxonomy HTML into {id, name, group} entries.
// Verified structure (2026-08-14, arxiv.org/category_taxonomy):
//   groups are delimited by  <h2 class="accordion-head" id="accordion-head-grp_{group}">
//     followed by  <div class="accordion-body" id="accordion-panel-grp_{group}">...</div>
//   each category inside is   <h4>{id} <span>({name})</span></h4>
// The group filter must match the explicit group field, NOT an id prefix: the physics
// group contains non-"physics"-prefixed ids (astro-ph.*, hep-*, quant-ph, etc.).
function parseTaxonomy(html) {
	const categories = [];
	const groupRe =
		/<h2 class="accordion-head" id="accordion-head-grp_([^"]+)">\s*<button[^>]*>(.*?)<\/button>\s*<\/h2>\s*<div class="accordion-body" id="[^"]+"[^>]*>(.*?)(?=<h2 class="accordion-head"|$)/gs;
	let gm;
	while ((gm = groupRe.exec(html)) !== null) {
		const group = gm[1];
		const body = gm[3];
		const h4Re = /<h4>([^<]+?)<span>\(([^)]*)\)<\/span><\/h4>/gs;
		let hm;
		while ((hm = h4Re.exec(body)) !== null) {
			categories.push({ id: hm[1].trim(), name: hm[2].trim(), group });
		}
	}
	return categories;
}

export default async function (params) {
	const URL = "https://arxiv.org/category_taxonomy";
	const resp = await fetch(URL, {
		headers: {
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WebSculpt-command",
		},
	});
	if (!resp.ok) {
		const err = new Error(
			`[HTTP_${resp.status}] arxiv.org/category_taxonomy returned ${resp.status} ${resp.statusText}`
		);
		err.code = `HTTP_${resp.status}`;
		throw err;
	}
	const html = await resp.text();

	const categories = parseTaxonomy(html);
	if (categories.length === 0) {
		const err = new Error(
			"[DRIFT_DETECTED] The category taxonomy page yielded no categories. Expected <h4>id <span>(name)</span></h4> entries inside accordion-head-grp_* group blocks at arxiv.org/category_taxonomy."
		);
		err.code = "DRIFT_DETECTED";
		throw err;
	}

	// --group is optional; empty value is treated the same as omitted (list all).
	const groupParam = params.group;
	if (groupParam !== undefined && groupParam !== "") {
		const validGroups = [...new Set(categories.map((c) => c.group))];
		if (!validGroups.includes(groupParam)) {
			const err = new Error(
				`[INVALID_GROUP] Unknown group "${groupParam}". Valid values: ${validGroups.join(
					", "
				)}. Omit --group to list all ${categories.length} categories.`
			);
			err.code = "INVALID_GROUP";
			throw err;
		}
		return categories.filter((c) => c.group === groupParam);
	}

	return categories;
}
