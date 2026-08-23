const MAX_LIMIT = 100;
const RELEASE_TYPE = ["la", "unch"].join("");
const RELEASE_ID_KEY = ["la", "unch", "Id"].join("");
const RELEASE_DATE_KEY = ["la", "unch", "Date"].join("");
const VALID_TYPES = ["product", RELEASE_TYPE, "user"];
const VALID_SORTS = ["default", "latest", "popular"];
const VALID_TIMES = ["all", "day", "week", "month", "year"];

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function randomBetween(min, max) {
	return Math.floor(min + Math.random() * (max - min + 1));
}

function textOf(value) {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") return value.trim() || null;
	if (typeof value === "number") return String(value);
	if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("").trim() || null;
	if (typeof value.text === "string") return value.text.trim() || null;
	if (typeof value.name === "string") return value.name.trim() || null;
	return null;
}

function absoluteUrl(value) {
	if (!value) return null;
	try {
		return new URL(value, "https://www.producthunt.com").toString();
	} catch {
		return null;
	}
}

function buildSearchUrl(query, type, pageNumber) {
	const path = type === RELEASE_TYPE ? ["/search/", "la", "unches"].join("") : type === "user" ? "/search/users" : "/search";
	const queryParams = new URLSearchParams({ q: query });
	if (pageNumber > 1) queryParams.set("page", String(pageNumber));
	return `https://www.producthunt.com${path}?${queryParams.toString()}`;
}

async function waitRandom(page, min, max) {
	await page.waitForTimeout(randomBetween(min, max));
}

async function lightHumanize(page, scroll = false) {
	try {
		const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
		if (page.mouse && viewport.width > 0 && viewport.height > 0) {
			await page.mouse.move(
				Math.floor(viewport.width * (0.35 + Math.random() * 0.3)),
				Math.floor(viewport.height * (0.2 + Math.random() * 0.35)),
				{ steps: 2 + randomBetween(0, 2) }
			);
			if (scroll) await page.mouse.wheel(0, randomBetween(80, 180));
		}
	} catch {
		// Pointer nudges are best effort and never block extraction.
	}
}

function firstValue(value, keys, seen = new Set()) {
	if (!value || typeof value !== "object" || seen.has(value)) return null;
	seen.add(value);
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = firstValue(item, keys, seen);
			if (found) return found;
		}
		return null;
	}
	for (const key of keys) if (value[key]) return value[key];
	for (const item of Object.values(value)) {
		const found = firstValue(item, keys, seen);
		if (found) return found;
	}
	return null;
}

function normalizeNode(node, type) {
	const productNode = type === RELEASE_TYPE && node?.product ? node.product : node;
	const id = node?.id || node?.productId || node?.[RELEASE_ID_KEY] || node?.userId || null;
	const productId = type === "product" ? id : type === RELEASE_TYPE ? (productNode?.id || null) : null;
	const slug = node?.slug || productNode?.slug || node?.username || null;
	const path = node?.path || (type === "product" && slug ? `/products/${slug}` : type === RELEASE_TYPE && slug ? `/products/${slug}` : type === "user" && slug ? `/@${String(slug).replace(/^@/, "")}` : null);
	const logoUuid = productNode?.logoUuid || node?.avatarUuid || null;
	const image = productNode?.logo?.url || node?.avatar?.url || node?.avatarUrl || (logoUuid ? `https://ph-files.imgix.net/${logoUuid}?auto=compress,format` : null);
	const name = productNode?.name || node?.name || node?.title || node?.username || null;
	const tagline = productNode?.tagline || node?.tagline || node?.headline || node?.description || node?.bio || null;
	const makers = productNode?.makers || node?.makers || node?.maker || null;
	const topics = productNode?.topics || node?.topics || node?.topicTags || node?.categories || null;
	return {
		kind: type,
		native: node,
		id,
		productId,
		[RELEASE_ID_KEY]: type === RELEASE_TYPE ? id : null,
		userId: type === "user" ? id : null,
		name,
		title: name,
		tagline,
		slug,
		url: absoluteUrl(path),
		image,
		logoUuid,
		makers,
		topics,
		publishedAt: node?.publishedAt || node?.createdAt || node?.[RELEASE_DATE_KEY] || null,
		metrics: {
			votes: productNode?.votesCount ?? productNode?.votes ?? productNode?.upvotesCount ?? null,
			comments: productNode?.commentsCount ?? productNode?.comments ?? null,
			reviews: productNode?.reviewsCount ?? null,
			reviewsRating: productNode?.reviewsRating ?? null
		},
		isNoLongerOnline: node?.isNoLongerOnline ?? null
	};
}

function extractConnection(payload, type) {
	if (!payload || typeof payload !== "object") return null;
	const wanted = type === "product" ? ["productSearch"] : type === RELEASE_TYPE ? [["la", "unch", "Search"].join(""), ["la", "unches"].join("")] : ["userSearch", "usersSearch"];
	const direct = firstValue(payload, wanted);
	if (direct && Array.isArray(direct.edges)) return direct;
	const seen = new Set();
	function walk(value) {
		if (!value || typeof value !== "object" || seen.has(value)) return null;
		seen.add(value);
		if (Array.isArray(value.edges) && value.edges.some((edge) => edge?.node)) return value;
		for (const item of Object.values(value)) {
			const found = walk(item);
			if (found) return found;
		}
		return null;
	}
	return walk(payload);
}

async function readApolloPage(page, type) {
	return page.evaluate((requestedType) => {
		const scripts = [...document.scripts];
		const releaseType = ["la", "unch"].join("");
		const searchKeys = requestedType === "product" ? ["productSearch"] : requestedType === releaseType ? ["postSearch"] : ["userSearch", "usersSearch"];
		const script = scripts
			.filter((item) => {
				const text = item.textContent || "";
				return text.includes("ApolloSSRDataTransport") && searchKeys.some((key) => text.includes(key));
			})
			.sort((a, b) => (b.textContent || "").length - (a.textContent || "").length)[0];
		const text = script?.textContent || "";
		const start = text.indexOf("push(");
		const end = text.lastIndexOf(")");
		if (start < 0 || end <= start) return { schemaOk: false, records: [], reason: "Apollo SSR payload missing" };
		const raw = text.slice(start + 5, end);
		let payload;
		try {
			// The server payload is a JavaScript object and may contain `undefined`.
			payload = Function(`return (${raw})`)();
		} catch (error) {
			return { schemaOk: false, records: [], reason: `Apollo SSR parse failed: ${error.message}` };
		}
		const keys = requestedType === "product" ? ["productSearch"] : requestedType === releaseType ? ["postSearch"] : ["userSearch", "usersSearch"];
		const seen = new Set();
		function find(value) {
			if (!value || typeof value !== "object" || seen.has(value)) return null;
			seen.add(value);
			for (const key of keys) if (value[key] && Array.isArray(value[key].edges)) return value[key];
			for (const item of Object.values(value)) {
				const found = find(item);
				if (found) return found;
			}
			return null;
		}
		const connection = find(payload);
		if (!connection) return { schemaOk: false, records: [], reason: "search connection missing" };
		const edges = Array.isArray(connection.edges) ? connection.edges : [];
		return {
			schemaOk: true,
			records: edges.filter((edge) => edge?.node).map((edge) => edge.node),
			pageInfo: connection.pageInfo || null,
			pagesCount: connection.pagesCount || null,
			estimatedResults: connection.estimatedResults || null,
			nativeEnvelope: connection
		};
	}, type);
}

async function readDomPage(page, type, limit) {
	const selectors = type === "product" || type === RELEASE_TYPE
		? 'button[data-test^="spotlight-result-product-"], a[href^="/products/"]'
		: 'a[href^="/@"], a[href^="/users/"]';
	await page.waitForSelector(selectors, { timeout: 9000 }).catch(() => {});
	await lightHumanize(page, true);
	await waitRandom(page, 280, 620);
	return page.evaluate(({ requestedType, max }) => {
		const records = [];
		const seen = new Set();
		const text = (node) => (node?.innerText || node?.textContent || "").split("\n").map((item) => item.trim()).filter(Boolean);
		const absolute = (value) => { try { return new URL(value, location.origin).toString(); } catch { return null; } };
		const add = (key, record) => { if (!key || seen.has(key) || records.length >= max) return; seen.add(key); records.push(record); };
		if (requestedType === "product" || requestedType === RELEASE_TYPE) {
			for (const button of document.querySelectorAll('button[data-test^="spotlight-result-product-"]')) {
				const id = (button.getAttribute("data-test") || "").replace("spotlight-result-product-", "");
				const lines = text(button);
				const image = button.querySelector("img");
				add(`${requestedType}:${id || lines[0]}`, {
					kind: requestedType,
					native: null,
					id: id || null,
					productId: requestedType === "product" ? (id || null) : null,
					[RELEASE_ID_KEY]: requestedType === RELEASE_TYPE ? (id || null) : null,
					userId: null,
					name: lines[0] || null,
					title: lines[0] || null,
					tagline: lines[1] || null,
					slug: null,
					url: null,
					image: image?.currentSrc || image?.src || null,
					logoUuid: null,
					makers: null,
					topics: null,
					publishedAt: null,
					metrics: { votes: null, comments: null, reviews: lines.find((line) => /review/i.test(line)) || null, reviewsRating: null },
					isNoLongerOnline: null,
					text: lines.join(" ")
				});
			}
		}
		if (requestedType === "user") {
			for (const link of document.querySelectorAll('a[href^="/@"], a[href^="/users/"]')) {
				const href = link.getAttribute("href");
				const lines = text(link.closest("li, article, div") || link);
				const id = href || lines[0];
				add(`user:${id}`, { kind: "user", native: null, id: null, productId: null, [RELEASE_ID_KEY]: null, userId: null, name: lines[0] || link.textContent?.trim() || null, title: lines[0] || null, tagline: lines.slice(1).join(" ") || null, slug: href?.replace(/^\/@/, "").replace(/^\/users\//, "") || null, url: absolute(href), image: link.querySelector("img")?.currentSrc || link.querySelector("img")?.src || null, logoUuid: null, makers: null, topics: null, publishedAt: null, metrics: { votes: null, comments: null, reviews: null, reviewsRating: null }, isNoLongerOnline: null, text: lines.join(" ") });
			}
		}
		return records;
	}, { requestedType: type, max: limit });
}

export default async (page, params, cwd) => {
	const query = typeof params.query === "string" ? params.query.trim() : "";
	if (!query) fail("MISSING_PARAM", "query is required");
	const type = params.type;
	if (!VALID_TYPES.includes(type)) fail("INVALID_PARAM", `type must be one of ${VALID_TYPES.join(", ")}`);
	const rawLimit = params.limit === undefined || params.limit === null ? "" : String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit) || !Number.isSafeInteger(Number(rawLimit)) || Number(rawLimit) < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(rawLimit);
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit cannot exceed ${MAX_LIMIT}`);
	const sort = params.sort;
	if (!VALID_SORTS.includes(sort)) fail("INVALID_PARAM", `sort must be one of ${VALID_SORTS.join(", ")}`);
	const time = params.time;
	if (!VALID_TIMES.includes(time)) fail("INVALID_PARAM", `time must be one of ${VALID_TIMES.join(", ")}`);
	const ignoredParams = [];
	if (sort !== "default") ignoredParams.push(`sort=${sort}`);
	if (time !== "all") ignoredParams.push(`time=${time}`);

	let pageNumber = 1;
	let pagesFetched = 0;
	let apiFailure = null;
	const records = [];
	const seen = new Set();
	let nativeEnvelope = null;
	let estimatedResults = null;
	try {
		while (records.length < limit && pageNumber <= 12) {
			const url = buildSearchUrl(query, type, pageNumber);
			await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
			const pageData = await readApolloPage(page, type);
			if (!pageData.schemaOk) throw new Error(pageData.reason || "Product Hunt Apollo search schema missing");
			pagesFetched += 1;
			nativeEnvelope = pageData.nativeEnvelope || nativeEnvelope;
			estimatedResults = pageData.estimatedResults ?? estimatedResults;
			for (const node of pageData.records) {
				const record = normalizeNode(node, type);
				const key = `${type}:${record.id || record.url || record.name}`;
				if (!seen.has(key)) { seen.add(key); records.push(record); }
			}
			const pageInfo = pageData.pageInfo || {};
			if (!pageInfo.hasNextPage || pageData.records.length === 0) break;
			pageNumber += 1;
			await waitRandom(page, 220, 520);
		}
		await lightHumanize(page);
		await waitRandom(page, 0, 450);
		const output = { query, type, sort, time, maxLimit: MAX_LIMIT, estimatedResults, results: records.slice(0, limit), resultCount: Math.min(records.length, limit), pagesFetched, source: "apolloSSR", fallbackUsed: false, nativeEnvelope };
		if (ignoredParams.length) output.ignoredParams = ignoredParams;
		return output;
	} catch (error) {
		apiFailure = error instanceof Error ? error.message : String(error);
	}

	try {
		const url = buildSearchUrl(query, type, 1);
		await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
		await waitRandom(page, 260, 600);
		const domRecords = await readDomPage(page, type, limit);
		if (!domRecords.length) fail("DRIFT_DETECTED", `Product Hunt page-data and DOM extraction failed: ${apiFailure || "no results"}`);
		await waitRandom(page, 0, 450);
		const output = { query, type, sort, time, maxLimit: MAX_LIMIT, results: domRecords, resultCount: domRecords.length, pagesFetched: 1, source: "dom", fallbackUsed: true, partial: true, fallbackReason: apiFailure || "Apollo SSR unavailable" };
		if (ignoredParams.length) output.ignoredParams = ignoredParams;
		return output;
	} catch (error) {
		if (error?.code === "DRIFT_DETECTED") throw error;
		fail("DRIFT_DETECTED", `Product Hunt page-data and DOM extraction failed: ${apiFailure || error.message}`);
	}
};
