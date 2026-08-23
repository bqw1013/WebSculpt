// pinterest/get-pin — fetch a single Pinterest Pin (image or video post) by URL or
// numeric id via browser.
// Verified path (explore 2026-08-19):
//   - SSR: <script id="__PWS_INITIAL_PROPS__"> -> initialReduxState.pins[<id>]
//     title=closeup_unified_title|grid_title, description=closeup_description,
//     image=images.orig.url, video=V_HLSV4.url (m3u8), source=link, creator=pinner,
//     reaction=reaction_counts["1"], commentCount=aggregated_pin_data.comment_count.
//   - comments: click [data-test-id="canonical-card-tap-area"] to expand the feed; it
//     loads via UnifiedCommentsResource (details/done_at) and
//     AggregatedCommentReplyFeedResource (text/created_at). Scroll the comment feed
//     container to trigger bookmark pagination. Rendered comments live in
//     [data-test-id="author-and-comment-container"].
//   - related: window scroll to bottom triggers RelatedModulesResource (page_size 12,
//     bookmark pagination); response data[] are full pin objects.
//   - NOT_FOUND: a bad id 302-redirects to /?show_error=true; the id is absent from
//     initialReduxState.pins.
// Pacing: random short waits (200-500ms) between scroll/load steps, with adaptive
// backoff on no-progress, to stay gentle against Pinterest throttling.

const PIN_PREFIX = "https://www.pinterest.com/pin/";
const SSR_SCRIPT_SELECTOR = "#__PWS_INITIAL_PROPS__";
const COMMENT_TAP_SELECTOR = '[data-test-id="canonical-card-tap-area"]';
const COMMENT_ITEM_SELECTOR = '[data-test-id="author-and-comment-container"]';
const COMMENT_RESOURCE_RE = /\/resource\/[A-Za-z]*[Cc]omment[A-Za-z]*\/get\//;
const RELATED_RESOURCE_RE = /RelatedModulesResource/;
const MAX_COMMENT_LIMIT = 100;
const MAX_RELATED_LIMIT = 50;
const MAX_SSR_WAIT_MS = 20000;
const MAX_COMMENT_LOAD_WAIT_MS = 12000;
const MAX_COMMENT_SCROLLS = 40;
const MAX_RELATED_SCROLLS = 30;

function fail(code, message) {
	const err = new Error(`[${code}] ${message}`);
	err.code = code;
	throw err;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNavigationError(error) {
	const message = error && error.message ? error.message : String(error);
	return (
		message.includes("Execution context was destroyed") ||
		message.includes("most likely because of a navigation") ||
		message.includes("Cannot find context with specified id")
	);
}

function normalizePinId(urlOrId) {
	const s = String(urlOrId == null ? "" : urlOrId).trim();
	if (s === "") {
		fail("MISSING_PARAM", "required parameter 'url' is missing or empty");
	}
	if (/^\d+$/.test(s)) return s;
	const match = s.match(/\/pin\/(\d+)/);
	if (match) return match[1];
	fail(
		"INVALID_PARAM",
		`url must be a Pinterest pin URL (pinterest.com/pin/{id}) or a numeric pin id, got '${s}'`
	);
}

function parseLimit(raw, paramName, max, min) {
	const t = String(raw == null ? "" : raw).trim();
	if (!/^\d+$/.test(t)) {
		fail("INVALID_PARAM", `${paramName} must be a non-negative integer, got '${raw}'`);
	}
	const n = Number(t);
	if (min != null && n < min) {
		fail("INVALID_PARAM", `${paramName} must be >= ${min}, got '${raw}'`);
	}
	if (n > max) {
		fail("LIMIT_EXCEEDED", `${paramName} ${n} exceeds max ${max}`);
	}
	return n;
}

function extractPinFromSsr(pinId) {
	// Runs in the browser context. pinId is passed as an argument.
	const el = document.getElementById("__PWS_INITIAL_PROPS__");
	if (!el) return { hasSsr: false, pin: null };
	let data = null;
	try {
		data = JSON.parse(el.textContent);
	} catch (err) {
		return { hasSsr: true, pin: null };
	}
	const pin =
		data &&
		data.initialReduxState &&
		data.initialReduxState.pins &&
		data.initialReduxState.pins[pinId];
	if (!pin) return { hasSsr: true, pin: null };
	const videoHls =
		pin.videos &&
		pin.videos.video_list &&
		pin.videos.video_list.V_HLSV4 &&
		pin.videos.video_list.V_HLSV4.url;
	const imageUrl = pin.images && pin.images.orig && pin.images.orig.url;
	const pinner = pin.pinner || {};
	const agg = pin.aggregated_pin_data || {};
	const reactions = pin.reaction_counts && pin.reaction_counts["1"];
	return {
		hasSsr: true,
		pin: {
			id: pin.id,
			title: pin.closeup_unified_title || pin.grid_title || "",
			description: pin.closeup_description || "",
			imageUrl: videoHls ? null : imageUrl || null,
			videoHlsUrl: videoHls || null,
			sourceLink: pin.link || null,
			creator: {
				username: pinner.username || null,
				displayName: pinner.full_name || pinner.first_name || null,
				profileUrl: pinner.username
					? "https://www.pinterest.com/" + pinner.username + "/"
					: null
			},
			reactionCount: reactions != null ? reactions : null,
			commentCount: agg.comment_count != null ? agg.comment_count : 0
		}
	};
}

function readCommentsFromDom() {
	// Runs in the browser context. Returns rendered comments in DOM order.
	const items = Array.from(
		document.querySelectorAll('[data-test-id="author-and-comment-container"]')
	);
	return items.map((acc) => {
		const link = acc.querySelector("a");
		const href = link ? link.getAttribute("href") || "" : "";
		const usernameMatch = href.match(/\/([^\/]+)\/?$/);
		const texts = Array.from(acc.querySelectorAll('[data-test-id="text-container"]'))
			.map((t) => t.textContent.trim())
			.filter(Boolean);
		return {
			author: link ? link.textContent.trim() : null,
			username: usernameMatch ? usernameMatch[1] : null,
			text: texts.join(" ") || null
		};
	});
}

function scrollCommentFeed() {
	// Runs in the browser context. Scrolls every scrollable ancestor of the comment
	// feed (plus the window) to the bottom to trigger comment pagination.
	const comment = document.querySelector('[data-test-id="author-and-comment-container"]');
	if (!comment) return false;
	let el = comment.parentElement;
	let scrolled = false;
	while (el && el !== document.body) {
		if (el.scrollHeight > el.clientHeight + 40) {
			el.scrollTop = el.scrollHeight;
			scrolled = true;
		}
		el = el.parentElement;
	}
	window.scrollTo(0, document.documentElement.scrollHeight);
	return scrolled;
}

function countCommentItems() {
	// Runs in the browser context.
	return document.querySelectorAll('[data-test-id="author-and-comment-container"]').length;
}

function scrollWindowToBottom() {
	// Runs in the browser context.
	window.scrollTo(0, document.documentElement.scrollHeight);
}

function collectCommentBody(body, sink, seenIds) {
	// Node-context helper: extracts normalized comments from a resource response.
	const data = body && body.resource_response && body.resource_response.data;
	if (!Array.isArray(data)) return;
	for (const c of data) {
		if (!c || typeof c !== "object" || !c.user || c.id == null) continue;
		if (seenIds.has(c.id)) continue;
		seenIds.add(c.id);
		sink.push({
			id: c.id,
			username: c.user.username || null,
			author: c.user.full_name || c.user.username || null,
			text: (c.details || c.text || "").trim(),
			createdAt: c.done_at || c.created_at || null
		});
	}
}

function makeCommentCollector(sink, seenIds) {
	// Attach this to page.on("response"). The regex matches any comment resource;
	// collectCommentBody filters to genuine comment entries.
	return async (resp) => {
		if (!COMMENT_RESOURCE_RE.test(resp.url())) return;
		let body = null;
		try {
			body = await resp.json();
		} catch (err) {
			try {
				body = JSON.parse(await resp.text());
			} catch (err2) {
				return;
			}
		}
		collectCommentBody(body, sink, seenIds);
	};
}

function mapRelatedPin(p) {
	const imageUrl = p.images && p.images.orig && p.images.orig.url;
	return {
		id: p.id,
		title: p.title || p.grid_title || "",
		imageUrl: imageUrl || null,
		pinUrl: "https://www.pinterest.com/pin/" + p.id + "/"
	};
}

export default async (page, params, cwd) => {
	const pinId = normalizePinId(params.url);
	const includeComments = params.include_comments === "true";
	const commentLimit = parseLimit(params.comment_limit, "comment_limit", MAX_COMMENT_LIMIT, 1);
	const relatedLimit = parseLimit(params.related_limit, "related_limit", MAX_RELATED_LIMIT, 0);

	const targetUrl = PIN_PREFIX + pinId;
	try {
		await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
	} catch (error) {
		fail(
			"DRIFT_DETECTED",
			`Pinterest pin page failed to load: ${error && error.message ? error.message : error}`
		);
	}

	// Wait for SSR data and extract the pin (fast path: no comments/related).
	let pin = null;
	const ssrStartedAt = Date.now();
	while (Date.now() - ssrStartedAt < MAX_SSR_WAIT_MS) {
		let probe = null;
		try {
			probe = await page.evaluate(extractPinFromSsr, pinId);
		} catch (error) {
			if (isTransientNavigationError(error)) {
				await sleep(300);
				continue;
			}
			throw error;
		}
		if (probe && probe.hasSsr) {
			if (probe.pin) {
				pin = probe.pin;
				break;
			}
			// SSR present but the pin is missing -> bad id / not found.
			fail("NOT_FOUND", `pin ${pinId} not found (page rendered without this pin)`);
		}
		await sleep(300);
	}

	if (!pin) {
		const finalUrl = page.url();
		if (!finalUrl.includes(`/pin/${pinId}`)) {
			fail("NOT_FOUND", `pin ${pinId} not found (redirected to ${finalUrl})`);
		}
		fail(
			"DRIFT_DETECTED",
			`pin ${pinId}: SSR script (#__PWS_INITIAL_PROPS__) did not render in time`
		);
	}

	// Optional comments (lazy-loaded; only fetched when requested).
	if (includeComments && pin.commentCount > 0) {
		const apiComments = [];
		const seenIds = new Set();
		const commentCollector = makeCommentCollector(apiComments, seenIds);
		page.on("response", commentCollector);

		try {
			await page.waitForSelector(COMMENT_TAP_SELECTOR, { timeout: 10000 });
			await page.evaluate((sel) => {
				const el = document.querySelector(sel);
				if (el) el.click();
			}, COMMENT_TAP_SELECTOR);
		} catch (err) {
			// No tap target: the pin may have no expandable comment section.
		}

		// Wait for the first comments to render.
		let renderedCount = 0;
		const commentWaitStart = Date.now();
		while (Date.now() - commentWaitStart < MAX_COMMENT_LOAD_WAIT_MS) {
			try {
				renderedCount = await page.evaluate(countCommentItems);
			} catch (error) {
				if (isTransientNavigationError(error)) {
					await sleep(250);
					continue;
				}
				throw error;
			}
			if (renderedCount > 0) break;
			await sleep(200 + Math.random() * 300);
		}

		// Scroll the comment feed to paginate up to comment_limit. Pacing: random
		// short waits (200-500ms) with adaptive backoff on no progress.
		let commentGuard = 0;
		let commentBackoff = 200;
		while (renderedCount < commentLimit && commentGuard < MAX_COMMENT_SCROLLS) {
			const before = renderedCount;
			try {
				await page.evaluate(scrollCommentFeed);
			} catch (error) {
				if (!isTransientNavigationError(error)) throw error;
			}
			await sleep(commentBackoff + Math.random() * 300);
			try {
				renderedCount = await page.evaluate(countCommentItems);
			} catch (error) {
				if (!isTransientNavigationError(error)) throw error;
			}
			commentGuard += 1;
			if (renderedCount <= before) {
				if (commentBackoff >= 1000) break;
				commentBackoff += 200;
			} else {
				commentBackoff = 200;
			}
		}

		// Let async response collectors finish.
		await sleep(400);

		const domComments = await page.evaluate(readCommentsFromDom);

		// Attach createdAt from the API responses where the author+text match.
		const apiByUserText = new Map();
		const apiTextCount = new Map();
		const apiByText = new Map();
		for (const c of apiComments) {
			const text = String(c.text || "").toLowerCase();
			const key = String(c.username || "").toLowerCase() + "|" + text;
			if (!apiByUserText.has(key)) apiByUserText.set(key, c.createdAt);
			apiTextCount.set(text, (apiTextCount.get(text) || 0) + 1);
			if (!apiByText.has(text)) apiByText.set(text, c.createdAt);
		}
		const comments = domComments.slice(0, commentLimit).map((c) => {
			const text = String(c.text || "").toLowerCase();
			const key = String(c.username || "").toLowerCase() + "|" + text;
			let createdAt = apiByUserText.get(key) || null;
			if (!createdAt && apiTextCount.get(text) === 1) {
				createdAt = apiByText.get(text) || null;
			}
			return {
				author: c.author,
				text: c.text,
				createdAt
			};
		});

		pin.comments = comments;
		if (comments.length > 0 && comments.length < commentLimit) {
			pin.partial = true;
		}
		page.removeListener("response", commentCollector);
	} else if (includeComments) {
		pin.comments = [];
	}

	// Optional related Pins ("More like this"; scroll-triggered).
	if (relatedLimit > 0) {
		const relatedPins = [];
		const seenRelated = new Set();
		const relatedCollector = async (resp) => {
			if (!RELATED_RESOURCE_RE.test(resp.url())) return;
			try {
				const body = await resp.json();
				const data = body && body.resource_response && body.resource_response.data;
				if (!Array.isArray(data)) return;
				for (const p of data) {
					if (!p || typeof p !== "object" || p.id == null) continue;
					if (seenRelated.has(p.id)) continue;
					seenRelated.add(p.id);
					relatedPins.push(mapRelatedPin(p));
				}
			} catch (err) {
				// Malformed/consumed body: ignore.
			}
		};
		page.on("response", relatedCollector);

		let relatedGuard = 0;
		let relatedBackoff = 200;
		while (relatedPins.length < relatedLimit && relatedGuard < MAX_RELATED_SCROLLS) {
			const before = relatedPins.length;
			try {
				await page.evaluate(scrollWindowToBottom);
			} catch (error) {
				if (!isTransientNavigationError(error)) throw error;
			}
			await sleep(relatedBackoff + Math.random() * 300);
			relatedGuard += 1;
			if (relatedPins.length <= before) {
				if (relatedBackoff >= 1000) break;
				relatedBackoff += 200;
			} else {
				relatedBackoff = 200;
			}
		}

		await sleep(400);
		pin.relatedPins = relatedPins.slice(0, relatedLimit);
		if (pin.relatedPins.length > 0 && pin.relatedPins.length < relatedLimit) {
			pin.partial = true;
		}
		page.removeListener("response", relatedCollector);
	}

	return pin;
};
