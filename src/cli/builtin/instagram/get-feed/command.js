const MAX_LIMIT = 100;
const HOME_URL = "https://www.instagram.com/";
const FEED_DATA_KEY = "xdt_api__v1__feed__timeline__connection";

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function captionText(value) {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (typeof value.text === "string") return value.text;
	return null;
}

function mediaTypeToType(mediaType) {
	if (mediaType === 2) return "video";
	if (mediaType === 8) return "carousel";
	return "image";
}

function collectMedia(media) {
	const out = [];
	if (!media) return out;
	const items = Array.isArray(media.carousel_media) && media.carousel_media.length
		? media.carousel_media
		: [media];
	for (const item of items) {
		if (
			item.image_versions2 &&
			Array.isArray(item.image_versions2.candidates) &&
			item.image_versions2.candidates.length
		) {
			const cand = item.image_versions2.candidates[item.image_versions2.candidates.length - 1];
			if (cand && cand.url) out.push({ type: "image", url: cand.url });
		}
		if (Array.isArray(item.video_versions) && item.video_versions.length && item.video_versions[0].url) {
			out.push({ type: "video", url: item.video_versions[0].url });
		}
	}
	return out;
}

function sourceOf(node) {
	if (node && node.ad) return "ad";
	let media = null;
	if (node && node.explore_story) media = node.explore_story.media;
	else if (node && node.media) media = node.media;
	if (media && media.user && media.user.friendship_status) {
		return media.user.friendship_status.following === true ? "following" : "suggested";
	}
	if (node && node.explore_story) return "suggested";
	return "following";
}

function edgeToRecord(node) {
	if (!node) return null;
	let media = null;
	if (node.media) media = node.media;
	else if (node.explore_story) media = node.explore_story.media;
	else if (node.ad && Array.isArray(node.ad.items) && node.ad.items[0]) media = node.ad.items[0];
	if (!media || !media.code) return null;
	const user = media.user || null;
	return {
		shortcode: media.code,
		url: `https://www.instagram.com/p/${media.code}/`,
		type: mediaTypeToType(media.media_type),
		author: user
			? { username: user.username, profileUrl: `https://www.instagram.com/${user.username}/` }
			: null,
		caption: captionText(media.caption),
		likeCount: media.like_count ?? null,
		commentCount: media.comment_count ?? null,
		timestamp: media.taken_at ?? null,
		media: collectMedia(media),
		source: sourceOf(node)
	};
}

function connToRecords(conn, records, seen) {
	if (!conn || !Array.isArray(conn.edges)) return;
	for (const edge of conn.edges) {
		const rec = edgeToRecord(edge.node);
		if (!rec) continue;
		const key = rec.shortcode;
		if (seen.has(key)) continue;
		seen.add(key);
		records.push(rec);
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

	const records = [];
	const seen = new Set();
	const feedResponses = [];
	let scrolls = 0;

	const handler = async (resp) => {
		if (!resp.url().includes("graphql")) return;
		let json;
		try {
			json = await resp.json();
		} catch (e) {
			return;
		}
		const conn = json && json.data && json.data[FEED_DATA_KEY];
		if (conn && Array.isArray(conn.edges)) feedResponses.push(conn);
	};

	page.on("response", handler);
	try {
		await page.goto(HOME_URL, { waitUntil: "domcontentloaded", timeout: 45000 });
		await page.waitForSelector("main article", { timeout: 25000 }).catch(() => {});

		// Drain any feed responses already captured during load.
		while (feedResponses.length) connToRecords(feedResponses.shift(), records, seen);

		// First page is embedded in SSR JSON; parse it when present.
		if (records.length < limit) {
			const ssrConn = await page.evaluate((dataKey) => {
				for (const s of document.querySelectorAll('script[type="application/json"]')) {
					const text = s.textContent || "";
					if (!text.includes(dataKey)) continue;
					let parsed;
					try {
						parsed = JSON.parse(text);
					} catch (e) {
						continue;
					}
					const walk = (obj) => {
						if (!obj || typeof obj !== "object") return null;
						if (!Array.isArray(obj) && obj[dataKey]) return obj[dataKey];
						for (const k in obj) {
							const r = walk(obj[k]);
							if (r) return r;
						}
						return null;
					};
					const conn = walk(parsed);
					if (conn && Array.isArray(conn.edges) && conn.edges.length) return conn;
				}
				return null;
			}, FEED_DATA_KEY);
			if (ssrConn) connToRecords(ssrConn, records, seen);
		}

		// Scroll to trigger the app's natural pagination XHRs until limit or stall.
		let stall = 0;
		while (records.length < limit && stall < 4 && scrolls < 30) {
			const before = records.length;
			await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
			await waitRandom(page, 1500, 3000);
			scrolls += 1;
			while (feedResponses.length) connToRecords(feedResponses.shift(), records, seen);
			if (records.length === before) stall += 1;
			else stall = 0;
		}

		// Final drain for responses that arrived after the last wait.
		while (feedResponses.length) connToRecords(feedResponses.shift(), records, seen);
	} finally {
		page.off("response", handler);
	}

	if (!records.length) {
		fail("DRIFT_DETECTED", "Instagram feed GraphQL extraction failed: no feed items found");
	}

	const partial = records.length < limit;
	return {
		results: records.slice(0, limit),
		resultCount: Math.min(records.length, limit),
		maxLimit: MAX_LIMIT,
		partial,
		pagesFetched: scrolls
	};
};
