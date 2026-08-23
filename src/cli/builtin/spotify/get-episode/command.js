// Helper: extract episode id from a Spotify episode URL like .../episode/{id}
function extractEpisodeId(url) {
	const m = String(url || "").match(/\/episode\/([A-Za-z0-9]+)/);
	return m ? m[1] : null;
}

// Helper: pull the trailing segment out of a spotify:xxx uri
function idFromUri(uri) {
	if (!uri) return null;
	const parts = String(uri).split(":");
	return parts[parts.length - 1] || null;
}

// Helper: pick the largest (highest-resolution) cover url from coverArt.sources
function pickLargestCover(sources) {
	if (!Array.isArray(sources) || sources.length === 0) return null;
	let best = sources[0];
	for (const s of sources) {
		if ((s.height || 0) > (best.height || 0)) best = s;
	}
	return best.url || null;
}

// Helper: map a pathfinder Episode entity (episodeUnionV2 or a seoRecommendedEpisode item) to the output shape
function mapEpisodeEntity(ent, episodeId, targetUrl) {
	const showData = (ent.podcastV2 && ent.podcastV2.data) || null;
	const showId = showData ? idFromUri(showData.uri) : null;
	const labels = (ent.contentRatingsV2 && ent.contentRatingsV2.labels) || [];
	const mediaTypes = Array.isArray(ent.mediaTypes) ? ent.mediaTypes : [];
	const cdnPreview = ent.previewPlayback && ent.previewPlayback.audioPreview && ent.previewPlayback.audioPreview.cdnUrl;
	const ownId = episodeId || idFromUri(ent.uri);
	const ownUrl = targetUrl || (ownId ? `https://open.spotify.com/episode/${ownId}` : null);
	return {
		id: ownId,
		url: ownUrl,
		title: ent.name || null,
		show: showData
			? { id: showId, url: showId ? `https://open.spotify.com/show/${showId}` : null, title: showData.name || null }
			: null,
		date: (ent.releaseDate && ent.releaseDate.isoString) || null,
		duration: (ent.duration && ent.duration.totalMilliseconds) || null,
		description: ent.description || null,
		explicit: labels.indexOf("EXPLICIT") !== -1 || (ent.contentRating && ent.contentRating.label === "EXPLICIT") || false,
		isVideo: mediaTypes.indexOf("VIDEO") !== -1,
		cover: pickLargestCover(ent.coverArt && ent.coverArt.sources),
		previewUrl: cdnPreview || null,
	};
}

export default async (page, params, cwd) => {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const jitter = () => sleep(200 + Math.floor(Math.random() * 500));

	// Resolve the episode id from --id or --url (one of the two is required)
	let episodeId = params.id ? String(params.id).trim() : "";
	if (params.url) {
		const found = extractEpisodeId(params.url);
		if (!found) {
			const err = new Error("[INVALID_URL] Episode URL must contain /episode/{id}");
			err.code = "INVALID_URL";
			throw err;
		}
		episodeId = found;
	}
	if (!episodeId) {
		const err = new Error("[MISSING_PARAM] Either --url or --id is required");
		err.code = "MISSING_PARAM";
		throw err;
	}
	if (!/^[A-Za-z0-9]{5,40}$/.test(episodeId)) {
		const err = new Error("[INVALID_ID] Invalid episode id");
		err.code = "INVALID_ID";
		throw err;
	}

	const targetUrl = `https://open.spotify.com/episode/${episodeId}`;
	const wantRelated = params.include_related === "true";

	// Capture pathfinder GraphQL responses fired by the page. Response handlers
	// are fire-and-forget; every async path is caught so a rejection never
	// escapes and kills the shared daemon.
	const isComplete = (e) => e && e.duration && e.releaseDate;
	const capture = { episode: null, related: null };
	page.on("response", (res) => {
		const u = res.url();
		if (u && u.indexOf("pathfinder/v2/query") !== -1) {
			res.text()
				.then((text) => {
					try {
						const parsed = JSON.parse(text);
						if (parsed && parsed.data) {
							if (parsed.data.episodeUnionV2) {
								// getEpisodeOrChapter fires multiple times; later responses can be
								// partial stubs (no duration/releaseDate). Prefer the complete payload.
								if (isComplete(parsed.data.episodeUnionV2) || !isComplete(capture.episode)) {
									capture.episode = parsed.data.episodeUnionV2;
								}
							}
							if (parsed.data.seoRecommendedEpisode) capture.related = parsed.data.seoRecommendedEpisode;
						}
					} catch (e) {}
				})
				.catch(() => {});
		}
	});

	try {
		await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
	} catch (e) {
		const err = new Error("[NAVIGATION_FAILED] Could not load the episode page");
		err.code = "NAVIGATION_FAILED";
		throw err;
	}

	// Wait for the episode metadata GraphQL response
	const metaDeadline = Date.now() + 15000;
	while (Date.now() < metaDeadline && !capture.episode) {
		await jitter();
	}

	// If requested, scroll to the bottom to trigger the "More like this" shelf
	let relatedPartial = false;
	if (wantRelated) {
		const relDeadline = Date.now() + 12000;
		while (Date.now() < relDeadline && !capture.related) {
			try {
				await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
			} catch (e) {}
			await jitter();
		}
		relatedPartial = !capture.related;
	}

	if (capture.episode) {
		const ent = capture.episode;
		if (ent.__typename === "NotFound" || ent.__typename === "GenericError") {
			const err = new Error("[NOT_FOUND] Episode not found");
			err.code = "NOT_FOUND";
			throw err;
		}
		const result = { ...mapEpisodeEntity(ent, episodeId, targetUrl), partial: relatedPartial };
		if (wantRelated) {
			const related = [];
			if (capture.related && Array.isArray(capture.related.items)) {
				for (const item of capture.related.items) {
					const d = item && item.data;
					if (!d || d.__typename === "NotFound" || d.__typename === "GenericError") continue;
					const mapped = mapEpisodeEntity(d);
					related.push({
						id: mapped.id,
						url: mapped.url,
						title: mapped.title,
						show: mapped.show ? { id: mapped.show.id, title: mapped.show.title } : null,
					});
				}
			}
			result.related = related;
		}
		return result;
	}

	// ---- GraphQL metadata missing: try a DOM fallback ----
	const dom = await page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const qa = (s) => Array.from(document.querySelectorAll(s));
		const main = q("main") || document.body;
		const text = (main.innerText || "").replace(/\n+/g, " ");
		const h1 = main.querySelector("h1");
		const title = h1 ? h1.textContent.trim() : null;
		const showA = qa('a[href*="/show/"]').find((a) => a.getAttribute("href") && a.getAttribute("href") !== "#");
		let showId = null;
		if (showA) {
			const m = showA.getAttribute("href").match(/\/show\/([A-Za-z0-9]+)/);
			showId = m ? m[1] : null;
		}
		const dateMatch = text.match(/(20\d{2}[年/\-.]\d{1,2}[月/\-.]\d{1,2}|[A-Z][a-z]{2}\s+\d{1,2},\s+20\d{2})/);
		const durMatch = text.match(/(\d+\s*(?:小时|hr)\s*\d*\s*(?:分钟|min)?|\d+\s*(?:分钟|min))\b/i);
		let description = null;
		const blocks = qa("main div")
			.map((el) => (el.innerText || "").trim())
			.filter((t) => t.length > 200)
			.sort((a, b) => b.length - a.length);
		if (blocks.length > 0) description = blocks[0];
		const notFoundText = title === null && /not found|we can't find|page not available|unavailable/i.test(text);
		return {
			title,
			showTitle: showA ? showA.textContent.trim() : null,
			showId,
			date: dateMatch ? dateMatch[0] : null,
			duration: durMatch ? durMatch[0] : null,
			description,
			notFoundText,
		};
	});

	if (!dom.title && dom.notFoundText) {
		const err = new Error("[NOT_FOUND] Episode not found");
		err.code = "NOT_FOUND";
		throw err;
	}
	if (!dom.title) {
		const err = new Error("[DRIFT_DETECTED] Could not find episode content on the page");
		err.code = "DRIFT_DETECTED";
		throw err;
	}

	const fallback = {
		id: episodeId,
		url: targetUrl,
		title: dom.title,
		show: dom.showId ? { id: dom.showId, url: `https://open.spotify.com/show/${dom.showId}`, title: dom.showTitle } : null,
		date: dom.date || null,
		duration: dom.duration || null,
		description: dom.description || null,
		explicit: null,
		isVideo: null,
		cover: null,
		previewUrl: null,
		partial: true,
	};
	if (wantRelated) fallback.related = [];
	return fallback;
};
