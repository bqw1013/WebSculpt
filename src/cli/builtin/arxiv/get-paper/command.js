// arxiv/get-paper: fetch the full record of a single arXiv paper from its abstract page.
// Single source of truth: https://arxiv.org/abs/{id} (one HTTP request per invocation,
// which naturally satisfies arXiv's >=3s request etiquette).

const ABS_BASE = "https://arxiv.org/abs/";
const PDF_BASE = "https://arxiv.org/pdf/";

function decodeEntities(s) {
	if (!s) return s;
	return s
		.replace(/&#x([0-9a-f]+);/gi, (_, h) => {
			try {
				return String.fromCodePoint(parseInt(h, 16));
			} catch {
				return _;
			}
		})
		.replace(/&#(\d+);/g, (_, d) => {
			try {
				return String.fromCodePoint(parseInt(d, 10));
			} catch {
				return _;
			}
		})
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&");
}

function stripTags(s) {
	return s.replace(/<[^>]+>/g, " ");
}

function metaContent(html, name) {
	const re = new RegExp('<meta name="' + name + '" content="([^"]*)"', "i");
	const m = html.match(re);
	return m ? decodeEntities(m[1]) : null;
}

function normalizeId(raw) {
	let id = raw.trim();
	const urlMatch = id.match(/^https?:\/\/(?:export\.)?arxiv\.org\/(?:abs|pdf)\/(.+)$/i);
	if (urlMatch) id = urlMatch[1];
	return id.replace(/\/+$/, "");
}

function extractAuthors(html) {
	const m = html.match(/<div class="authors">([\s\S]*?)<\/div>/);
	if (!m) return [];
	// Use the displayed text of the authors div, split on ",". This matches the
	// visible page exactly, including collaboration names like "The ATLAS
	// Collaboration" where "The" sits outside the author <a> element.
	const text = decodeEntities(stripTags(m[1]))
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^Authors:\s*/i, "");
	return text ? text.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function extractVersions(html) {
	const m = html.match(/<div class="submission-history">([\s\S]*?)<\/div>/);
	if (!m) return [];
	const block = m[1];
	const versions = [];
	const re = /\[v(\d+)\][\s\S]*?([A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} UTC)/g;
	let match;
	while ((match = re.exec(block))) {
		const date = new Date(match[2]);
		if (isNaN(date.getTime())) continue;
		versions.push({ version: "v" + match[1], date: date.toISOString().replace(/\.000Z$/, "Z") });
	}
	return versions;
}

function extractCategories(html) {
	const m = html.match(/<td class="tablecell subjects">([\s\S]*?)<\/td>/);
	if (!m) return { primary: null, all: [] };
	const cell = m[1];
	const valid = /^[a-z][a-z0-9-]*(\.[A-Za-z][A-Za-z0-9-]*)?$/;
	const all = [];
	const codeRe = /\(([^)]+)\)/g;
	let c;
	while ((c = codeRe.exec(cell))) {
		const code = c[1].trim();
		if (valid.test(code) && !all.includes(code)) all.push(code);
	}
	let primary = all[0] || null;
	const pm = cell.match(/<span class="primary-subject">[^<]*\(([^)]+)\)/i);
	if (pm && valid.test(pm[1].trim())) primary = pm[1].trim();
	return { primary, all };
}

function parseMetatable(html) {
	const m = html.match(/<div class="metatable">([\s\S]*?)<\/table>/);
	if (!m) return [];
	const rows = [];
	const trRe = /<tr>([\s\S]*?)<\/tr>/g;
	let tr;
	while ((tr = trRe.exec(m[1]))) {
		const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
		if (tds.length >= 2) {
			const label = decodeEntities(stripTags(tds[0])).replace(/\s+/g, " ").trim().replace(/:$/, "");
			const value = decodeEntities(stripTags(tds[1])).replace(/\s+/g, " ").trim();
			rows.push({ label, value });
		}
	}
	return rows;
}

export default async function (params) {
	if (!params.id || !params.id.trim()) {
		const err = new Error("[MISSING_PARAM] Missing required parameter: id");
		err.code = "MISSING_PARAM";
		throw err;
	}

	const id = normalizeId(params.id);
	const url = ABS_BASE + id;

	let res;
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), 30000);
	try {
		res = await fetch(url, {
			headers: {
				"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
			},
			signal: controller.signal,
			redirect: "follow"
		});
	} catch (e) {
		const err = new Error("[REQUEST_FAILED] Failed to fetch arXiv abstract page: " + (e && e.message ? e.message : String(e)));
		err.code = "REQUEST_FAILED";
		throw err;
	} finally {
		clearTimeout(timer);
	}

	if (res.status === 404) {
		const err = new Error("[NOT_FOUND] arXiv paper \"" + id + "\" not found (HTTP 404)");
		err.code = "NOT_FOUND";
		throw err;
	}
	if (!res.ok) {
		const err = new Error("[REQUEST_FAILED] arXiv request failed with HTTP " + res.status);
		err.code = "REQUEST_FAILED";
		throw err;
	}

	const html = await res.text();

	const canonicalId = metaContent(html, "citation_arxiv_id");
	const versions = extractVersions(html);
	if (!canonicalId || versions.length === 0) {
		const err = new Error("[DRIFT_DETECTED] arXiv abstract page structure changed: expected citation_arxiv_id and version history not found");
		err.code = "DRIFT_DETECTED";
		throw err;
	}

	const requestedVer = (id.match(/v(\d+)$/) || [])[1];
	const requestedVersion = requestedVer ? "v" + requestedVer : null;
	const version = requestedVersion || versions[versions.length - 1].version;

	const categories = extractCategories(html);
	const meta = parseMetatable(html);
	const commentRow = meta.find((r) => r.label === "Comments");
	const journalRow = meta.find((r) => r.label === "Journal reference");
	const comment = commentRow && commentRow.value ? commentRow.value : null;
	const journalRef = journalRow && journalRow.value ? journalRow.value : null;

	const journalDoi = metaContent(html, "citation_doi");
	const doi = journalDoi || "10.48550/arXiv." + canonicalId;

	const suffix = requestedVersion || "";
	const urlOut = ABS_BASE + canonicalId + suffix;
	const pdfUrl = PDF_BASE + canonicalId + suffix;

	return {
		id: canonicalId,
		version,
		title: metaContent(html, "citation_title"),
		authors: extractAuthors(html),
		abstract: (metaContent(html, "citation_abstract") || "").trim(),
		categories,
		publishedAt: versions[0].date,
		updatedAt: versions[versions.length - 1].date,
		versions,
		comment,
		journalRef,
		doi,
		url: urlOut,
		pdfUrl
	};
}
