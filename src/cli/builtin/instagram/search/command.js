const MAX_LIMIT = 100;
const VALID_TYPES = ["media", "accounts"];
const SEARCH_FRIENDLY_NAME = "PolarisKeywordSearchExplorePageRelayQuery";

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function absUrl(value) {
	if (!value) return null;
	try { return new URL(value, "https://www.instagram.com").toString(); } catch { return null; }
}

function captionText(value) {
	if (!value) return null;
	if (typeof value === "string") return value;
	return typeof value.text === "string" ? value.text : null;
}

function collectPage(payload) {
	const graph = payload?.data?.xdt_fbsearch__top_serp_graphql;
	if (!graph || !Array.isArray(graph.edges)) return { schemaOk: false, records: [], cursor: null, envelope: null };
	const records = [];
	const seen = new Set();
	for (const edge of graph.edges) {
		for (const native of edge?.node?.items || []) {
			if (!native || native.__typename !== "XDTMediaDict") continue;
			const key = String(native.id || native.pk || native.code || "");
			if (!key || seen.has(key)) continue;
			seen.add(key);
			const code = native.code || null;
			records.push({
				kind: "media",
				native,
				id: native.id || null,
				pk: native.pk || null,
				code,
				url: code ? `https://www.instagram.com/p/${code}/` : null,
				caption: captionText(native.caption),
				user: native.user || null,
				mediaType: native.media_type ?? null,
				takenAt: native.taken_at ?? null,
				imageVersions: native.image_versions2 || null,
				videoVersions: native.video_versions || null,
				metrics: {
					likeCount: native.like_count ?? null,
					commentCount: native.comment_count ?? null,
					viewCount: native.view_count ?? null
				}
			});
		}
	}
	return {
		schemaOk: true,
		records,
		cursor: graph.page_info?.has_next_page ? graph.page_info.end_cursor : null,
		envelope: { viewer: payload?.data?.xdt_viewer || null, pageInfo: graph.page_info || null }
	};
}

function mergeRecords(target, page) {
	const keys = new Set(target.map((item) => item.id || item.pk || item.code));
	for (const item of page.records) {
		const key = item.id || item.pk || item.code;
		if (key && !keys.has(key)) { keys.add(key); target.push(item); }
	}
}

async function waitRandom(page, min, max) {
	await page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
}

async function searchAccounts(page, query) {
	await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded" });
	await waitRandom(page, 500, 1500);
	let payload;
	try {
		payload = await page.evaluate(async ({ q }) => {
			const response = await fetch(`/web/search/topsearch/?query=${encodeURIComponent(q)}`, { credentials: "include" });
			if (!response.ok) throw new Error(`Instagram topsearch HTTP ${response.status}`);
			return response.json();
		}, { q: query });
	} catch (error) {
		fail("DRIFT_DETECTED", `Instagram topsearch failed: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!payload || !Array.isArray(payload.users)) {
		fail("DRIFT_DETECTED", "Instagram topsearch schema missing");
	}
	const records = payload.users
		.map((entry) => entry?.user || null)
		.filter((user) => user && user.pk)
		.map((user) => ({
			kind: "account",
			pk: user.pk || null,
			id: user.id || user.pk || null,
			username: user.username || null,
			fullName: user.full_name || null,
			isVerified: !!user.is_verified,
			isPrivate: !!user.is_private,
			profilePicUrl: user.profile_pic_url || null,
			socialContext: user.social_context || user.search_social_context || null
		}));
	return { records, hasMore: !!payload.has_more, rankToken: payload.rank_token || null };
}

export default async (page, params, cwd) => {
	const query = typeof params.query === "string" ? params.query.trim() : "";
	if (!query) fail("MISSING_PARAM", "query is required");
	const type = String(params.type).toLowerCase();
	if (!VALID_TYPES.includes(type)) fail("INVALID_PARAM", `type must be one of ${VALID_TYPES.join(", ")}`);
	const rawLimit = String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(rawLimit);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

	if (type === "accounts") {
		const { records, hasMore, rankToken } = await searchAccounts(page, query);
		const output = {
			query,
			type,
			maxLimit: MAX_LIMIT,
			results: records.slice(0, limit),
			resultCount: Math.min(records.length, limit),
			source: "topsearch",
			hasMore,
			rankToken,
			partial: records.length < limit
		};
		return output;
	}

	const url = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(query)}`;
	let apiFailure = null;
	try {
		const responsePromise = page.waitForResponse((response) => {
			if (!response.url().includes("/api/graphql")) return false;
			const name = response.request().headers()["x-fb-friendly-name"] || "";
			return name === SEARCH_FRIENDLY_NAME;
		}, { timeout: 18000 });
		await page.goto(url, { waitUntil: "domcontentloaded" });
		const firstResponse = await responsePromise;
		if (!firstResponse || !firstResponse.ok()) throw new Error("Instagram search GraphQL response unavailable");
		const firstPayload = await firstResponse.json();
		let pageData = collectPage(firstPayload);
		if (!pageData.schemaOk) throw new Error("Instagram search GraphQL schema missing");
		const records = [...pageData.records];
		const postData = firstResponse.request().postData();
		let cursor = pageData.cursor;
		let pagesFetched = 1;
		const cursors = new Set();
		while (records.length < limit && cursor && postData && pagesFetched < 12 && !cursors.has(cursor)) {
			cursors.add(cursor);
			await waitRandom(page, 500, 1000);
			const nextPayload = await page.evaluate(async ({ postData: rawBody, cursor: after }) => {
				const body = new URLSearchParams(rawBody);
				const variables = JSON.parse(body.get("variables"));
				variables.after = after;
				body.set("variables", JSON.stringify(variables));
				const response = await fetch("/api/graphql", {
					method: "POST",
					credentials: "include",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
						"x-ig-app-id": "936619743392459",
						"x-fb-friendly-name": "PolarisKeywordSearchExplorePageRelayQuery"
					},
					body: body.toString()
				});
				if (!response.ok) throw new Error(`Instagram pagination HTTP ${response.status}`);
				return response.json();
			}, { postData, cursor });
			pageData = collectPage(nextPayload);
			if (!pageData.schemaOk) throw new Error("Instagram pagination schema missing");
			mergeRecords(records, pageData);
			cursor = pageData.cursor;
			pagesFetched += 1;
		}
		await waitRandom(page, 120, 360);
		return {
			query,
			type,
			maxLimit: MAX_LIMIT,
			results: records.slice(0, limit),
			resultCount: Math.min(records.length, limit),
			source: "graphql",
			fallbackUsed: false,
			pagesFetched,
			partial: records.length < limit,
			nativeEnvelope: pageData.envelope
		};
	} catch (error) {
		apiFailure = error instanceof Error ? error.message : String(error);
	}

	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await waitRandom(page, 300, 680);
		await page.waitForSelector("main", { timeout: 7000 }).catch(() => {});
		const records = await page.evaluate(({ max }) => {
			const out = [];
			const seen = new Set();
			const abs = (value) => { try { return new URL(value, location.origin).toString(); } catch { return null; } };
			for (const link of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
				const href = abs(link.getAttribute("href"));
				const match = href?.match(/\/(?:p|reel)\/([^/?#]+)/);
				if (!match || seen.has(match[1])) continue;
				seen.add(match[1]);
				out.push({ kind: "media", native: null, id: match[1], pk: null, code: match[1], url: href, caption: (link.innerText || "").trim() || null, user: null, mediaType: null, takenAt: null, imageVersions: null, videoVersions: null, metrics: { likeCount: null, commentCount: null, viewCount: null } });
				if (out.length >= max) break;
			}
			return out;
		}, { max: limit });
		if (!records.length) fail("DRIFT_DETECTED", `Instagram GraphQL and DOM extraction failed: ${apiFailure || "no records"}`);
		return {
			query,
			type,
			maxLimit: MAX_LIMIT,
			results: records,
			resultCount: records.length,
			source: "dom",
			fallbackUsed: true,
			partial: true,
			fallbackReason: apiFailure || "GraphQL unavailable"
		};
	} catch (error) {
		if (error?.code === "DRIFT_DETECTED") throw error;
		fail("DRIFT_DETECTED", `Instagram GraphQL and DOM extraction failed: ${apiFailure || error.message}`);
	}
};
