const MAX_LIMIT = 100;
const REELS_FRIENDLY_NAME = "PolarisClipsTabDesktopPaginationQuery";
const REELS_ROOT_FIELD = "xdt_api__v1__clips__home__connection_v2";
const REELS_DOC_ID = "28439660052323373";
const IG_APP_ID = "936619743392459";
const MAX_PAGES = 40;

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

function seenReelsValue(records) {
	const ids = [];
	for (const record of records) {
		if (record.mediaId) ids.push({ id: record.mediaId });
	}
	return JSON.stringify(ids);
}

function collectPage(payload) {
	const conn = payload?.data?.xdt_api__v1__clips__home__connection_v2;
	if (!conn || !Array.isArray(conn.edges)) {
		return { schemaOk: false, records: [], cursor: null, hasNext: false, envelope: null };
	}
	const records = [];
	const seen = new Set();
	for (const edge of conn.edges) {
		const media = edge?.node?.media;
		if (!media || typeof media.code !== "string") continue;
		if (seen.has(media.code)) continue;
		seen.add(media.code);
		const username = media.user?.username || null;
		const videoVersions = Array.isArray(media.video_versions) ? media.video_versions : [];
		const videoUrl = videoVersions.length ? videoVersions[videoVersions.length - 1].url : null;
		records.push({
			shortcode: media.code,
			url: `https://www.instagram.com/reels/${media.code}/`,
			author: {
				username,
				profileUrl: username ? `https://www.instagram.com/${username}/` : null,
				isVerified: media.user?.is_verified ?? null
			},
			caption: captionText(media.caption),
			likeCount: media.like_count ?? null,
			commentCount: media.comment_count ?? null,
			shareCount: media.media_repost_count ?? null,
			videoUrl: videoUrl ? absUrl(videoUrl) : null,
			timestamp: media.taken_at ?? null,
			mediaId: String(media.pk || media.id || "")
		});
	}
	return {
		schemaOk: true,
		records,
		cursor: conn.page_info?.has_next_page ? conn.page_info.end_cursor : null,
		hasNext: !!conn.page_info?.has_next_page,
		envelope: { pageInfo: conn.page_info || null }
	};
}

function mergeRecords(target, page) {
	const keys = new Set(target.map((item) => item.shortcode));
	for (const item of page.records) {
		if (item.shortcode && !keys.has(item.shortcode)) {
			keys.add(item.shortcode);
			target.push(item);
		}
	}
}

async function waitRandom(page, min, max) {
	await page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
}

export default async (page, params, cwd) => {
	const rawLimit = String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(rawLimit);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

	const url = "https://www.instagram.com/reels/";
	const responsePromise = page.waitForResponse((response) => {
		if (!response.url().includes("graphql")) return false;
		const name = response.request().headers()["x-fb-friendly-name"] || "";
		return name === REELS_FRIENDLY_NAME;
	}, { timeout: 20000 });

	await page.goto(url, { waitUntil: "domcontentloaded" });

	let firstResponse;
	try {
		firstResponse = await responsePromise;
	} catch (error) {
		fail("DRIFT_DETECTED", `Instagram Reels GraphQL request not detected within timeout (login required?): ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!firstResponse || !firstResponse.ok()) {
		fail("DRIFT_DETECTED", "Instagram Reels GraphQL response unavailable");
	}
	const firstPayload = await firstResponse.json();
	const postData = firstResponse.request().postData();
	if (!postData || !postData.includes("variables")) {
		fail("DRIFT_DETECTED", "Instagram Reels GraphQL postData missing variables");
	}
	let pageData = collectPage(firstPayload);
	if (!pageData.schemaOk) fail("DRIFT_DETECTED", "Instagram Reels GraphQL schema missing");

	const records = [...pageData.records];
	let cursor = pageData.cursor;
	let hasNext = pageData.hasNext;
	let pagesFetched = 1;
	let apiFailure = null;
	const cursors = new Set();

	while (records.length < limit && cursor && hasNext && pagesFetched < MAX_PAGES && !cursors.has(cursor)) {
		cursors.add(cursor);
		await waitRandom(page, 1500, 3000);
		try {
			const nextPayload = await page.evaluate(async ({ postData: rawBody, after, seenReels, igAppId, friendlyName }) => {
				const body = new URLSearchParams(rawBody);
				const variables = JSON.parse(body.get("variables"));
				variables.after = after;
				variables.data = variables.data || {};
				variables.data.seen_reels = seenReels;
				body.set("variables", JSON.stringify(variables));
				const response = await fetch("/api/graphql", {
					method: "POST",
					credentials: "include",
					headers: {
						"content-type": "application/x-www-form-urlencoded",
						"x-ig-app-id": igAppId,
						"x-fb-friendly-name": friendlyName
					},
					body: body.toString()
				});
				if (!response.ok) throw new Error(`Instagram pagination HTTP ${response.status}`);
				return response.json();
			}, { postData, after: cursor, seenReels: seenReelsValue(records), igAppId: IG_APP_ID, friendlyName: REELS_FRIENDLY_NAME });
			pageData = collectPage(nextPayload);
			if (!pageData.schemaOk) fail("DRIFT_DETECTED", "Instagram pagination schema missing");
			mergeRecords(records, pageData);
			cursor = pageData.cursor;
			hasNext = pageData.hasNext;
			pagesFetched += 1;
		} catch (error) {
			apiFailure = error instanceof Error ? error.message : String(error);
			break;
		}
	}

	const outputResults = records.slice(0, limit).map(({ mediaId, ...rest }) => rest);
	const output = {
		limit,
		maxLimit: MAX_LIMIT,
		results: outputResults,
		resultCount: Math.min(records.length, limit),
		source: "graphql",
		partial: records.length < limit,
		pagesFetched
	};
	if (apiFailure) output.apiFailure = apiFailure;
	return output;
};
