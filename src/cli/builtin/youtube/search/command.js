const MAX_LIMIT = 100;
const VALID_TYPES = ["video", "channel", "playlist"];
const VALID_SORTS = ["default", "latest", "popular"];
const VALID_TIMES = ["day", "week", "month", "year", "all"];

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function textOf(value) {
	if (!value) return null;
	if (typeof value === "string") return value;
	if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("");
	if (typeof value.simpleText === "string") return value.simpleText;
	if (typeof value.content === "string") return value.content;
	return null;
}

function absoluteUrl(value) {
	if (!value) return null;
	try {
		return new URL(value, "https://www.youtube.com").toString();
	} catch {
		return null;
	}
}

function commandUrl(value) {
	return absoluteUrl(value?.commandMetadata?.webCommandMetadata?.url || value?.url);
}

function firstUrl(value, predicate, seen = new Set()) {
	if (!value || typeof value !== "object" || seen.has(value)) return null;
	seen.add(value);
	for (const [key, item] of Object.entries(value)) {
		if (typeof item === "string" && predicate(item, key)) return item;
		const nested = firstUrl(item, predicate, seen);
		if (nested) return nested;
	}
	return null;
}

function firstBrowse(value, seen = new Set()) {
	if (!value || typeof value !== "object" || seen.has(value)) return null;
	seen.add(value);
	if (value.browseEndpoint) return value.browseEndpoint;
	for (const item of Object.values(value)) {
		const nested = firstBrowse(item, seen);
		if (nested) return nested;
	}
	return null;
}

function firstImage(value, seen = new Set()) {
	if (!value || typeof value !== "object" || seen.has(value)) return null;
	seen.add(value);
	if (Array.isArray(value.thumbnails) && value.thumbnails.length) {
		return value.thumbnails[value.thumbnails.length - 1];
	}
	if (Array.isArray(value.sources) && value.sources.length && value.sources[value.sources.length - 1]?.url) {
		return value.sources[value.sources.length - 1];
	}
	for (const item of Object.values(value)) {
		const nested = firstImage(item, seen);
		if (nested) return nested;
	}
	return null;
}

function browseFromRuns(value) {
	for (const run of value?.runs || []) {
		const endpoint = run.navigationEndpoint?.browseEndpoint;
		if (endpoint) return endpoint;
	}
	return null;
}

function collectPage(data, requestedType) {
	if (!data || typeof data !== "object") return { schemaOk: false, records: [], token: null };
	const records = [];
	const keys = new Set();
	const seen = new Set();
	let token = null;

	function add(key, record) {
		if (!record || !key || keys.has(key)) return;
		keys.add(key);
		records.push(record);
	}

	function videoRecord(d, rendererType) {
		const videoId = d.videoId || d.contentId || null;
		if (!videoId) return;
		const title = textOf(d.title) || textOf(d.metadata?.lockupMetadataViewModel?.title);
		const ownerValue = d.ownerText || d.longBylineText || d.metadata?.lockupMetadataViewModel?.metadata;
		const ownerName = textOf(ownerValue);
		const endpoint = browseFromRuns(d.longBylineText) || browseFromRuns(d.ownerText) || firstBrowse(d);
		const watchUrl = absoluteUrl(d.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url) || absoluteUrl(`/watch?v=${videoId}`);
		const description = textOf(d.descriptionSnippet) || textOf(d.detailedMetadataSnippets?.[0]?.snippetText);
		const image = firstImage(d.thumbnail || d.contentImage || d);
		add(`video:${videoId}`, {
			kind: "video",
			rendererType,
			native: d,
			videoId,
			title: title || null,
			url: watchUrl,
			channel: {
				name: ownerName || null,
				channelId: endpoint?.browseId || null,
				url: absoluteUrl(endpoint?.canonicalBaseUrl || endpoint?.url) || null
			},
			publishedAt: textOf(d.publishedTimeText) || null,
			duration: textOf(d.lengthText) || null,
			thumbnail: image || null,
			description: description || null,
			metrics: {
				viewCountText: textOf(d.viewCountText) || null,
				shortViewCountText: textOf(d.shortViewCountText) || null,
				likeCountText: textOf(d.likeCountText) || null,
				commentCountText: textOf(d.commentCountText) || null
			}
		});
	}

	function channelRecord(d, rendererType) {
		const channelId = d.channelId || firstBrowse(d)?.browseId;
		if (!channelId) return;
		const endpoint = d.navigationEndpoint?.browseEndpoint || firstBrowse(d);
		const title = textOf(d.title);
		const rawVideoCount = textOf(d.videoCountText);
		const rawSubscriberCount = textOf(d.subscriberCountText);
		const subscriberCountText = /subscriber|订阅/i.test(rawVideoCount || "") ? rawVideoCount : (/subscriber|订阅/i.test(rawSubscriberCount || "") ? rawSubscriberCount : null);
		const videoCountText = /video|视频/i.test(rawSubscriberCount || "") ? rawSubscriberCount : (/video|视频/i.test(rawVideoCount || "") ? rawVideoCount : null);
		add(`channel:${channelId}`, {
			kind: "channel",
			rendererType,
			native: d,
			channelId,
			title: title || null,
			url: absoluteUrl(endpoint?.canonicalBaseUrl || endpoint?.url || d.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url),
			description: textOf(d.descriptionSnippet) || null,
			thumbnail: firstImage(d.thumbnail || d) || null,
			subscriberCountText,
			videoCountText,
			channel: { name: title || null, channelId, url: absoluteUrl(endpoint?.canonicalBaseUrl || endpoint?.url) || null, handle: /^@/.test(rawSubscriberCount || "") ? rawSubscriberCount : null }
		});
	}

	function playlistRecord(d, rendererType) {
		const playlistId = d.playlistId || d.contentId;
		if (!playlistId) return;
		const model = d.metadata?.lockupMetadataViewModel;
		const title = textOf(d.title) || textOf(model?.title);
		const rows = model?.metadata?.contentMetadataViewModel?.metadataRows || [];
		const metadataRows = rows.map((row) => row.metadataParts?.map((part) => textOf(part.text)).filter(Boolean).join(" ")).filter(Boolean);
		const url = firstUrl(d, (value) => value.includes(`/playlist?list=${playlistId}`)) || `/playlist?list=${playlistId}`;
		const creatorBrowse = firstBrowse(d);
		add(`playlist:${playlistId}`, {
			kind: "playlist",
			rendererType,
			native: d,
			playlistId,
			title: title || null,
			url: absoluteUrl(url),
			creator: {
				name: metadataRows[0] || null,
				channelId: creatorBrowse?.browseId || null,
				url: absoluteUrl(creatorBrowse?.canonicalBaseUrl || creatorBrowse?.url) || null
			},
			contentType: d.contentType || null,
			metadataRows,
			thumbnail: firstImage(d.contentImage || d) || null,
			description: textOf(d.descriptionSnippet) || null,
			videoCountText: textOf(d.videoCountText) || null
		});
	}

	function visit(value) {
		if (!value || typeof value !== "object" || seen.has(value)) return;
		seen.add(value);
		if (value.videoRenderer) videoRecord(value.videoRenderer, "videoRenderer");
		if (value.movieRenderer) videoRecord(value.movieRenderer, "movieRenderer");
		if (value.channelRenderer) channelRecord(value.channelRenderer, "channelRenderer");
		if (value.playlistRenderer) playlistRecord(value.playlistRenderer, "playlistRenderer");
		if (value.lockupViewModel) {
			const lockup = value.lockupViewModel;
			const contentType = lockup.contentType || "";
			if (contentType.includes("PLAYLIST") || contentType.includes("PODCAST")) playlistRecord(lockup, "lockupViewModel");
			else if (lockup.contentId && (lockup.contentId.length === 11 || contentType.includes("VIDEO")) && lockup.metadata?.lockupMetadataViewModel) videoRecord(lockup, "lockupViewModel");
		}
		if (value.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
			token = value.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
		}
		for (const item of Object.values(value)) visit(item);
	}

	visit(data);
	const filtered = requestedType === "video" ? records.filter((r) => r.kind === "video") : records.filter((r) => r.kind === requestedType);
	return {
		schemaOk: Boolean(data.contents || data.onResponseReceivedActions || data.responseContext),
		records: filtered,
		token,
		estimatedResults: data.estimatedResults || null,
		nativeEnvelope: {
			responseContext: data.responseContext || null,
			estimatedResults: data.estimatedResults || null,
			trackingParams: data.trackingParams || null
		}
	};
}

function buildSearchUrl(query, type, sort, time) {
	const queryParams = new URLSearchParams({ search_query: query });
	const typeSp = { video: "", channel: "EgIQAg==", playlist: "EgIQAw==" }[type];
	let sp = typeSp;
	if (sort === "popular") {
		sp = { video: "CAM=", channel: "CAMSAhAC", playlist: "CAMSAhAD" }[type];
	} else if (sort === "default" && type === "video" && time !== "all") {
		sp = { day: "EgIIAg==", week: "EgIIAw==", month: "EgIIBA==", year: "EgIIBQ==" }[time] || "";
	}
	if (sp) queryParams.set("sp", sp);
	return `https://www.youtube.com/results?${queryParams.toString()}`;
}

async function browserSnapshot(page) {
	return page.evaluate(() => {
		const data = window.ytInitialData;
		const config = typeof ytcfg !== "undefined" && typeof ytcfg.get === "function" ? ytcfg : null;
		const apiKey = config ? config.get("INNERTUBE_API_KEY") : null;
		const context = config ? config.get("INNERTUBE_CONTEXT") : null;
		return { data, apiKey, context };
	});
}

export default async (page, params, cwd) => {
	const query = String(params.query || "").trim();
	if (!query) fail("MISSING_PARAM", "query is required");
	const type = String(params.type).toLowerCase();
	if (!VALID_TYPES.includes(type)) fail("INVALID_PARAM", `type must be one of ${VALID_TYPES.join(", ")}`);
	const limitRaw = String(params.limit);
	if (!/^\d+$/.test(limitRaw)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(limitRaw);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);
	const sort = String(params.sort).toLowerCase();
	if (!VALID_SORTS.includes(sort)) fail("INVALID_PARAM", `sort must be one of ${VALID_SORTS.join(", ")}`);
	const time = String(params.time).toLowerCase();
	if (!VALID_TIMES.includes(time)) fail("INVALID_PARAM", `time must be one of ${VALID_TIMES.join(", ")}`);
	const ignoredParams = [];
	if (sort === "latest") ignoredParams.push("sort=latest");
	if (time !== "all" && (sort === "popular" || type !== "video")) ignoredParams.push(`time=${time}`);
	const effectiveTime = ignoredParams.includes(`time=${time}`) ? "all" : time;
	const url = buildSearchUrl(query, type, sort === "latest" ? "default" : sort, effectiveTime);
	const waitRandom = (min, max) => page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));

	let apiFailure = null;
	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await waitRandom(280, 620);
		await page.waitForFunction(() => Boolean(window.ytInitialData), null, { timeout: 12000 });
		const first = await browserSnapshot(page);
		let pageData = collectPage(first.data, type);
		if (!pageData.schemaOk) throw new Error("ytInitialData schema missing");
		const records = [...pageData.records];
		const tokens = new Set();
		let token = pageData.token;
		let pages = 1;
		while (records.length < limit && token && pages < 8 && !tokens.has(token)) {
			tokens.add(token);
			await waitRandom(220, 520);
			const next = await page.evaluate(async ({ apiKey, context, continuation }) => {
				const response = await fetch(`/youtubei/v1/search?key=${encodeURIComponent(apiKey)}`, {
					method: "POST",
					headers: { "content-type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ context, continuation })
				});
				if (!response.ok) throw new Error(`continuation HTTP ${response.status}`);
				return response.json();
			}, { apiKey: first.apiKey, context: first.context, continuation: token });
			pageData = collectPage(next, type);
			if (!pageData.schemaOk) throw new Error("continuation schema missing");
			for (const record of pageData.records) if (!records.some((item) => `${item.kind}:${item.videoId || item.channelId || item.playlistId}` === `${record.kind}:${record.videoId || record.channelId || record.playlistId}`)) records.push(record);
			token = pageData.token;
			pages += 1;
		}
		await waitRandom(0, 450);
		const output = {
			query,
			type,
			sort,
			time,
			maxLimit: MAX_LIMIT,
			estimatedResults: pageData.estimatedResults,
			results: records.slice(0, limit),
			resultCount: Math.min(records.length, limit),
			source: "ytInitialData",
			fallbackUsed: false,
			pagesFetched: pages,
			nativeEnvelope: pageData.nativeEnvelope
		};
		if (ignoredParams.length) output.ignoredParams = ignoredParams;
		return output;
	} catch (error) {
		apiFailure = error instanceof Error ? error.message : String(error);
	}

	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await waitRandom(220, 520);
		await page.waitForSelector("ytd-video-renderer, ytd-channel-renderer, ytd-playlist-renderer, a[href*='/watch?v='], a[href*='/channel/'], a[href*='/@'], a[href*='/playlist?list=']", { timeout: 7000 }).catch(() => {});
		const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
		await page.mouse.move(Math.max(20, Math.floor(viewport.width * 0.35)), Math.max(20, Math.floor(viewport.height * 0.4)));
		await page.mouse.wheel(0, 120 + Math.floor(Math.random() * 180));
		await waitRandom(300, 700);
		const records = await page.evaluate(({ type: requestedType, max }) => {
			const out = [];
			const seen = new Set();
			const txt = (el) => (el?.innerText || el?.textContent || "").trim() || null;
			const abs = (u) => { try { return new URL(u, location.origin).toString(); } catch { return null; } };
			const add = (key, record) => { if (!key || seen.has(key)) return; seen.add(key); out.push(record); };
			if (requestedType === "video") {
				for (const link of document.querySelectorAll("a#video-title, a[href*='/watch?v=']")) {
					const href = abs(link.getAttribute("href")); const id = href ? new URL(href).searchParams.get("v") : null; if (!id) continue;
					const container = link.closest("ytd-video-renderer, ytd-movie-renderer") || link.parentElement;
					add(`video:${id}`, { kind: "video", rendererType: "dom", native: null, videoId: id, title: txt(link), url: abs(`/watch?v=${id}`), channel: null, publishedAt: null, duration: null, thumbnail: container?.querySelector("img") ? { url: container.querySelector("img").src } : null, description: txt(container?.querySelector("yt-formatted-string.metadata-snippet-text, #description-text")), metrics: { viewCountText: null, shortViewCountText: null, likeCountText: null, commentCountText: null }, text: txt(container) });
				}
			} else if (requestedType === "channel") {
				for (const item of document.querySelectorAll("ytd-channel-renderer")) { const link = item.querySelector("a[href*='/@'], a[href*='/channel/']"); const href = abs(link?.getAttribute("href")); if (!href) continue; add(`channel:${href}`, { kind: "channel", rendererType: "dom", native: null, channelId: href.includes("/channel/") ? href.split("/channel/")[1].split(/[?&#]/)[0] : null, title: txt(item.querySelector("#title, yt-formatted-string")), url: href, description: txt(item.querySelector("#description")), thumbnail: item.querySelector("img") ? { url: item.querySelector("img").src } : null, subscriberCountText: null, videoCountText: null, text: txt(item) }); }
			} else {
				for (const item of document.querySelectorAll("ytd-playlist-renderer")) { const link = item.querySelector("a[href*='/playlist?list=']"); const href = abs(link?.getAttribute("href")); if (!href) continue; const id = new URL(href).searchParams.get("list"); add(`playlist:${id}`, { kind: "playlist", rendererType: "dom", native: null, playlistId: id, title: txt(item.querySelector("#video-title, #title, yt-formatted-string")), url: href, creator: null, contentType: null, metadataRows: [], thumbnail: item.querySelector("img") ? { url: item.querySelector("img").src } : null, description: null, videoCountText: null, text: txt(item) }); }
			}
			return out.slice(0, max);
		}, { type, max: limit });
		if (!records.length) fail("DRIFT_DETECTED", `YouTube page data and DOM extraction failed: ${apiFailure || "no records"}`);
		await waitRandom(0, 450);
		const output = { query, type, sort, time, maxLimit: MAX_LIMIT, results: records, resultCount: records.length, source: "dom", fallbackUsed: true, partial: true, fallbackReason: apiFailure || "ytInitialData unavailable" };
		if (ignoredParams.length) output.ignoredParams = ignoredParams;
		return output;
	} catch (error) {
		if (error?.code === "DRIFT_DETECTED") throw error;
		fail("DRIFT_DETECTED", `YouTube page data and DOM extraction failed: ${apiFailure || error.message}`);
	}
};
