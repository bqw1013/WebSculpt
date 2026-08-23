const MAX_COMMENT_LIMIT = 100;
const COMMENT_PAGE_SIZE = 25;
const VALID_COMMENT_SORTS = ["newest", "oldest"];
const API_HEADERS = { "Content-Type": "application/json", "vimeo-page": "/video/[clipId]" };

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function randomWait(page, min, max) {
	return page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
}

function lightHumanize(page) {
	try {
		return page.evaluate(() => {
			const width = window.innerWidth || 1920;
			const height = window.innerHeight || 1080;
			window.scrollBy(0, 80 + Math.floor(Math.random() * 120));
			const evt = new MouseEvent("mousemove", { clientX: Math.floor(width * (0.3 + Math.random() * 0.4)), clientY: Math.floor(height * (0.2 + Math.random() * 0.4)) });
			window.dispatchEvent(evt);
			return true;
		});
	} catch {
		return Promise.resolve(false);
	}
}

function extractVideoId(input) {
	const raw = String(input).trim();
	if (!raw) return null;
	if (/^\d{5,}$/.test(raw)) return raw;
	const withoutQuery = raw.split(/[?#]/)[0];
	const segments = withoutQuery.split("/").filter(Boolean);
	const last = segments[segments.length - 1] || "";
	if (/^\d{5,}$/.test(last)) return last;
	return null;
}

function stripHtml(html) {
	if (!html) return null;
	return html
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/<\/p>/gi, "\n")
		.replace(/<[^>]+>/g, "")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)))
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function readNextData(page) {
	return page.evaluate(() => {
		const el = document.getElementById("__NEXT_DATA__");
		if (!el) return null;
		try {
			return JSON.parse(el.textContent);
		} catch {
			return null;
		}
	});
}

function fetchVideoApi(page, videoId, token, query, urlSuffix) {
	return page.evaluate(async ({ id, token, suffix, query }) => {
		const headers = { Authorization: "jwt " + token, "Content-Type": "application/json", "vimeo-page": "/video/[clipId]" };
		const res = await fetch(`https://api.vimeo.com/videos/${id}${suffix}${query}`, { headers });
		if (!res.ok) return { __httpStatus: res.status };
		return res.json();
	}, { id: videoId, token, suffix: urlSuffix, query });
}

async function fetchCommentPage(page, videoId, token, direction, pageNo, perPage) {
	return page.evaluate(async ({ id, token, direction, pageNo, perPage }) => {
		const headers = { Authorization: "jwt " + token, "Content-Type": "application/json", "vimeo-page": "/video/[clipId]" };
		const res = await fetch(`https://api.vimeo.com/videos/${id}/comments?sort=date&direction=${direction}&page=${pageNo}&per_page=${perPage}&password=null`, { headers });
		if (!res.ok) return { __httpStatus: res.status };
		return res.json();
	}, { id: videoId, token, direction, pageNo, perPage });
}

export default async (page, params, cwd) => {
	const url = typeof params.url === "string" ? params.url.trim() : "";
	if (!url) fail("MISSING_PARAM", "url is required");
	const videoId = extractVideoId(url);
	if (!videoId) fail("INVALID_PARAM", `url must be a Vimeo video URL or numeric ID (got "${url}")`);

	const includeTranscript = params.include_transcript === "true";
	const includeComments = params.include_comments === "true";

	const rawLimit = String(params.comment_limit ?? "20").trim();
	if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "comment_limit must be a positive integer");
	const commentLimit = Number(rawLimit);
	if (!Number.isSafeInteger(commentLimit) || commentLimit < 1) fail("INVALID_PARAM", "comment_limit must be a positive integer");
	if (commentLimit > MAX_COMMENT_LIMIT) fail("LIMIT_EXCEEDED", `comment_limit ${commentLimit} exceeds maxLimit ${MAX_COMMENT_LIMIT}`);

	const commentSort = String(params.comment_sort ?? "newest").toLowerCase();
	if (!VALID_COMMENT_SORTS.includes(commentSort)) fail("INVALID_PARAM", `comment_sort must be one of ${VALID_COMMENT_SORTS.join(" | ")}`);

	const canonicalUrl = `https://vimeo.com/${videoId}`;

	await page.goto(canonicalUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
	try {
		await page.waitForSelector("#__NEXT_DATA__", { state: "attached", timeout: 20000 });
	} catch {
		// Non-standard pages (On Demand, live, unavailable) may never embed __NEXT_DATA__;
		// fall through so readNextData returns null and the clearer DRIFT_DETECTED / NOT_FOUND is raised.
	}
	await lightHumanize(page);
	await randomWait(page, 120, 320);

	const data = await readNextData(page);
	if (!data) fail("DRIFT_DETECTED", `__NEXT_DATA__ not found on ${canonicalUrl}`);
	const pageProps = data.props?.pageProps || {};
	const clip = pageProps.clip || null;
	if (!clip || !clip.uri) fail("NOT_FOUND", `video ${videoId} is unavailable or private`);

	const jwt = pageProps.viewerBootstrap?.jwt || null;
	const videoUriId = String(clip.uri).split("/").filter(Boolean).pop() || videoId;

	const pictures = (clip.pictures?.sizes || []).map((s) => s.link).filter(Boolean);
	const result = {
		id: videoId,
		title: clip.name || null,
		description: stripHtml(clip.descriptionHtml),
		url: canonicalUrl,
		duration: clip.duration ?? null,
		width: clip.width ?? null,
		height: clip.height ?? null,
		createdAt: clip.createdTime || null,
		contentRating: clip.contentRatingClass || null,
		privacy: clip.privacy || null,
		pictures,
		user: clip.user ? { name: clip.user.name || null, url: null } : null,
		stats: { views: null, likes: null, commentCount: null },
	};

	const jsonLd = pageProps.clipMetadata?.jsonLd || "";
	if (jsonLd) {
		const m = jsonLd.match(/"keywords":"([^"]*)"/);
		if (m) {
			result.tags = m[1].replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
		}
	}
	if (!result.tags) result.tags = [];

	if (jwt) {
		const apiData = await fetchVideoApi(page, videoUriId, jwt, "?fields=stats.plays,metadata.connections.likes.total,metadata.connections.comments.total,user.link,user.name", "");
		if (apiData && apiData.__httpStatus === undefined) {
			result.stats = {
				views: apiData.stats?.plays ?? null,
				likes: apiData.metadata?.connections?.likes?.total ?? null,
				commentCount: apiData.metadata?.connections?.comments?.total ?? null,
			};
			if (apiData.user?.link || apiData.user?.name) {
				result.user = { name: apiData.user.name || result.user?.name || null, url: apiData.user.link || null };
			}
		}
		await randomWait(page, 60, 180);
	}

	if (includeTranscript) {
		const seo = pageProps.seoTranscript;
		result.transcript = typeof seo === "string" && seo.trim().length > 0 ? seo : null;
	}

	if (includeComments) {
		const privacyComments = clip.privacy?.comments;
		const commentsDisabled = privacyComments !== "anybody";
		result.commentsDisabled = commentsDisabled;
		if (commentsDisabled) {
			result.comments = [];
			result.partial = false;
		} else if (!jwt) {
			result.comments = [];
			result.partial = true;
		} else {
			const direction = commentSort === "oldest" ? "asc" : "desc";
			const records = [];
			let pageNo = 1;
			let hasNext = true;
			while (hasNext && records.length < commentLimit && pageNo <= 40) {
				const pageData = await fetchCommentPage(page, videoUriId, jwt, direction, pageNo, COMMENT_PAGE_SIZE);
				if (!pageData || pageData.__httpStatus !== undefined) {
					hasNext = false;
					break;
				}
				for (const c of pageData.data || []) {
					if (records.length >= commentLimit) break;
					const u = c.metadata?.connections?.user || null;
					const guest = c.metadata?.connections?.guest_user || null;
					records.push({
						author: u?.name || guest?.name || null,
						authorUrl: u?.link || (guest?.uri ? `https://vimeo.com${guest.uri}` : null) || null,
						time: c.created_on || null,
						text: c.text || "",
						replyCount: c.metadata?.connections?.replies?.total ?? 0,
					});
				}
				hasNext = records.length < commentLimit && !!pageData.paging?.next;
				pageNo += 1;
				if (hasNext) await randomWait(page, 80, 220);
			}
			result.comments = records;
			result.partial = records.length < commentLimit;
		}
	}

	return result;
};
