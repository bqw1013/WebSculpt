const MAX_LIMIT = 100;
const POST_DATA_KEY = "xdt_api__v1__media__shortcode__web_info";
const COMMENTS_FRIENDLY = "PolarisPostCommentsPaginationQuery";
const COMMENTS_DOC_ID = "28082902984733691";
const CHILD_FRIENDLY = "PolarisPostChildCommentsQuery";
const CHILD_DOC_ID = "27823744063932558";
const IG_APP_ID = "936619743392459";
const SHORTCODE_RE = /(?:p|reel|reels)\/([^/?#]+)/;

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function waitRandom(page, min, max) {
	return page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
}

function pickBestMedia(images, videos) {
	if (videos && videos.length) {
		const best = videos.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a), videos[0]);
		return { type: "video", url: best.url };
	}
	if (images && images.length) {
		const best = images.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a), images[0]);
		return { type: "image", url: best.url };
	}
	return null;
}

function buildMedia(item) {
	const media = [];
	const carousel = Array.isArray(item.carousel_media) ? item.carousel_media : [];
	if (carousel.length) {
		for (const child of carousel) {
			const m = pickBestMedia(child.image_versions2?.candidates || null, child.video_versions || null);
			if (m) media.push(m);
		}
		return media;
	}
	const m = pickBestMedia(item.image_versions2?.candidates || null, item.video_versions || null);
	if (m) media.push(m);
	return media;
}

function mapType(item) {
	if (item.product_type === "clips") return "reel";
	if (item.product_type === "carousel_container" || (item.carousel_media && item.carousel_media.length)) return "carousel";
	if (item.product_type === "video_container" || (item.video_versions && item.video_versions.length)) return "video";
	return "image";
}

function timestampToISO(unix) {
	if (!unix) return null;
	const d = new Date(unix * 1000);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function captionText(caption) {
	if (!caption) return null;
	if (typeof caption === "string") return caption;
	if (typeof caption.text === "string") return caption.text;
	if (Array.isArray(caption)) {
		return caption.map((c) => (typeof c.text === "string" ? c.text : "")).join("") || null;
	}
	return null;
}

function buildPostOutput(item) {
	const username = item.user?.username || null;
	// Reels often hide like counts: like_count is then a placeholder (e.g. 3)
	// while comment_count stays real. hidden_likes_string_variant is -1 for
	// both hidden and normal posts, so detect via the placeholder pattern.
	const likeHidden = item.product_type === "clips" && (item.like_count ?? 0) <= 5 && (item.comment_count || 0) > 50;
	return {
		shortcode: item.code || null,
		url: item.code ? `https://www.instagram.com/p/${item.code}/` : null,
		type: mapType(item),
		author: {
			username,
			profileUrl: username ? `https://www.instagram.com/${username}/` : null
		},
		caption: captionText(item.caption),
		likeCount: item.like_count ?? null,
		likeCountHidden: likeHidden,
		commentCount: item.comment_count ?? null,
		timestamp: timestampToISO(item.taken_at),
		isReel: item.product_type === "clips",
		media: buildMedia(item)
	};
}

// Extract the embedded post item (RelayPrefetchedStreamCache) from page scripts.
async function extractPostItem(page) {
	const res = await page.evaluate((key) => {
		const scripts = [...document.querySelectorAll('script[type="application/json"]')];
		for (const script of scripts) {
			const text = script.textContent;
			if (!text.includes(key)) continue;
			try {
				const parsed = JSON.parse(text);
				let found = null;
				(function walk(o) {
					if (!o || typeof o !== "object" || found) return;
					if (o[key]) { found = o[key]; return; }
					for (const k of Object.keys(o)) walk(o[k]);
				})(parsed);
				if (found && Array.isArray(found.items) && found.items.length) {
					return { ok: true, item: found.items[0] };
				}
			} catch (e) { /* try next script */ }
		}
		return { ok: false };
	}, POST_DATA_KEY);
	return res.ok ? res.item : null;
}

// Re-issue a captured GraphQL request body with the given query + variables.
async function fetchGraphQL(page, templateBody, friendly, docId, variables) {
	return page.evaluate(async ({ templateBody: rawBody, friendly: f, docId: d, variables: vars, igAppId }) => {
		const body = new URLSearchParams(rawBody);
		body.set("fb_api_req_friendly_name", f);
		body.set("doc_id", d);
		body.set("variables", JSON.stringify(vars));
		const response = await fetch("/api/graphql", {
			method: "POST",
			credentials: "include",
			headers: {
				"content-type": "application/x-www-form-urlencoded",
				"x-ig-app-id": igAppId,
				"x-fb-friendly-name": f
			},
			body: body.toString()
		});
		if (!response.ok) throw new Error(`Instagram GraphQL HTTP ${response.status}`);
		const text = await response.text();
		return JSON.parse(text.replace(/^for \(;;\);/, ""));
	}, { templateBody, friendly, docId, variables, igAppId: IG_APP_ID });
}

function collectTopComments(payload) {
	const conn = payload?.data?.xdt_api__v1__media__media_id__comments__connection;
	if (!conn || !Array.isArray(conn.edges)) return null;
	const comments = conn.edges.map((edge) => {
		const node = edge.node || {};
		return {
			id: node.pk ?? null,
			author: { username: node.user?.username ?? null },
			text: typeof node.text === "string" ? node.text : "",
			likeCount: node.comment_like_count ?? null,
			timestamp: timestampToISO(node.created_at),
			childCount: node.child_comment_count ?? 0
		};
	});
	return { comments, pageInfo: conn.page_info || null };
}

function collectChildComments(payload) {
	const conn = payload?.data?.xdt_api__v1__media__media_id__comments__parent_comment_id__child_comments__connection;
	if (!conn || !Array.isArray(conn.edges)) return null;
	const comments = conn.edges.map((edge) => {
		const node = edge.node || {};
		return {
			id: node.pk ?? null,
			author: { username: node.user?.username ?? null },
			text: typeof node.text === "string" ? node.text : "",
			likeCount: node.comment_like_count ?? null,
			timestamp: timestampToISO(node.created_at)
		};
	});
	return { comments, pageInfo: conn.page_info || null };
}

async function fetchReplies(page, templateBody, mediaId, parentCommentId, maxReplies) {
	const replies = [];
	let cursor = null;
	let count = 0;
	let exhausted = false;
	while (count < maxReplies) {
		const first = Math.min(50, maxReplies - count);
		const payload = await fetchGraphQL(page, templateBody, CHILD_FRIENDLY, CHILD_DOC_ID, {
			after: cursor,
			before: null,
			first,
			last: null,
			media_id: String(mediaId),
			parent_comment_id: String(parentCommentId),
			is_chronological: null,
			__relay_internal__pv__PolarisIsLoggedInrelayprovider: true
		});
		const pageData = collectChildComments(payload);
		if (!pageData || !pageData.comments.length) { exhausted = true; break; }
		for (const r of pageData.comments) {
			replies.push(r);
			count += 1;
			if (count >= maxReplies) break;
		}
		if (!pageData.pageInfo?.has_next_page || !pageData.pageInfo?.end_cursor) { exhausted = true; break; }
		cursor = pageData.pageInfo.end_cursor;
		await waitRandom(page, 1500, 3000);
	}
	return { replies, exhausted };
}

export default async (page, params, cwd) => {
	const rawUrl = String(params.url ?? "").trim();
	if (!rawUrl) fail("MISSING_PARAM", "url is required");

	const match = rawUrl.match(SHORTCODE_RE);
	if (!match) fail("INVALID_PARAM", "url must be an Instagram post/reel URL like /p/{shortcode}/ or /reel/{shortcode}/");
	const shortcode = match[1];

	const includeComments = params.include_comments === "true";
	let commentLimit = 20;
	if (includeComments) {
		const rawLimit = String(params.comment_limit ?? "20").trim();
		if (!/^\d+$/.test(rawLimit)) fail("INVALID_PARAM", "comment_limit must be a positive integer");
		const parsed = Number(rawLimit);
		if (!Number.isSafeInteger(parsed) || parsed < 1) fail("INVALID_PARAM", "comment_limit must be a positive integer");
		if (parsed > MAX_LIMIT) fail("LIMIT_EXCEEDED", `comment_limit ${parsed} exceeds max ${MAX_LIMIT}`);
		commentLimit = parsed;
	}

	const url = `https://www.instagram.com/p/${shortcode}/`;

	// Capture any first-party GraphQL request body as a reusable template.
	const templatePromise = page.waitForResponse(
		(r) => r.url().includes("/api/graphql") && r.request().method() === "POST" && !!r.request().postData(),
		{ timeout: 15000 }
	).catch(() => null);

	await page.goto(url, { waitUntil: "domcontentloaded" });

	// Extract embedded post data (posts and reels share the web_info key on /p/).
	let item = null;
	for (let attempt = 0; attempt < 20 && !item; attempt++) {
		item = await extractPostItem(page);
		if (!item) await page.waitForTimeout(800);
	}

	if (!item) {
		const pageText = await page.evaluate(() => (document.body.innerText || "").slice(0, 600));
		if (/log ?in|登 ?录|login|inspermitted/i.test(pageText)) {
			fail("AUTH_REQUIRED", "Instagram login session is required to read this post");
		}
		if (/not available|isn't available|unavailable|页面不可用|无法访问|doesn't exist/i.test(pageText)) {
			fail("NOT_FOUND", `Instagram post ${shortcode} not found`);
		}
		fail("DRIFT_DETECTED", `Instagram embedded post data key (${POST_DATA_KEY}) not found on ${url}`);
	}

	const post = buildPostOutput(item);
	const output = { post };

	if (includeComments) {
		const templateResponse = await templatePromise;
		const templateBody = templateResponse ? templateResponse.request().postData() : null;
		if (!templateBody) fail("DRIFT_DETECTED", "Could not capture an Instagram GraphQL request body for comment fetch");

		const mediaId = String(item.pk);
		const comments = [];
		const seen = new Set();
		let cursor = null;
		let total = 0;
		let pagesFetched = 0;
		let exhausted = false;

		while (total < commentLimit && pagesFetched < 40) {
			const first = Math.min(50, commentLimit - total);
			const payload = await fetchGraphQL(page, templateBody, COMMENTS_FRIENDLY, COMMENTS_DOC_ID, {
				after: cursor,
				before: null,
				first,
				last: null,
				media_id: mediaId,
				sort_order: "popular",
				__relay_internal__pv__PolarisIsLoggedInrelayprovider: true
			});
			const pageData = collectTopComments(payload);
			if (!pageData || !pageData.comments.length) { exhausted = true; break; }
			pagesFetched += 1;

			let hitLimit = false;
			for (const c of pageData.comments) {
				if (total >= commentLimit) { hitLimit = true; break; }
				if (!c.id || seen.has(c.id)) continue;
				seen.add(c.id);
				let replies = [];
				const remainingAfterParent = commentLimit - total - 1;
				if (c.childCount > 0 && remainingAfterParent > 0) {
					const r = await fetchReplies(page, templateBody, mediaId, c.id, remainingAfterParent);
					replies = r.replies;
				}
				comments.push({
					id: c.id,
					author: c.author,
					text: c.text,
					likeCount: c.likeCount,
					timestamp: c.timestamp,
					replies: replies.map((x) => ({ id: x.id, author: x.author, text: x.text, likeCount: x.likeCount, timestamp: x.timestamp }))
				});
				total += 1 + replies.length;
				if (total >= commentLimit) { hitLimit = true; break; }
			}
			if (hitLimit) { exhausted = false; break; }
			if (!pageData.pageInfo?.has_next_page || !pageData.pageInfo?.end_cursor) { exhausted = true; break; }
			cursor = pageData.pageInfo.end_cursor;
			await waitRandom(page, 1500, 3000);
		}

		output.comments = comments;
		if (!exhausted) output.partial = true;
	}

	return output;
};
