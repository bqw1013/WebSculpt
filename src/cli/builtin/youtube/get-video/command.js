const MAX_LIMIT = 100;
const VALID_SORTS = ["top", "newest"];

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function extractVideoId(input) {
	const s = String(input).trim();
	if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
	const m =
		s.match(/[?&]v=([A-Za-z0-9_-]{11})/) ||
		s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/) ||
		s.match(/\/shorts\/([A-Za-z0-9_-]{11})/) ||
		s.match(/\/embed\/([A-Za-z0-9_-]{11})/) ||
		s.match(/\/v\/([A-Za-z0-9_-]{11})/);
	if (m) return m[1];
	fail("INVALID_URL", `Could not extract a YouTube video ID from: "${input}". Accepts watch?v=, /shorts/, youtu.be/ or a bare 11-char ID.`);
}

function parseCommentLimit(raw) {
	const s = String(raw).trim();
	if (!/^\d+$/.test(s)) fail("INVALID_PARAM", `comment_limit must be an integer between 1 and ${MAX_LIMIT}, got "${raw}"`);
	const n = Number(s);
	if (n < 1 || n > MAX_LIMIT) fail("INVALID_PARAM", `comment_limit must be between 1 and ${MAX_LIMIT}, got "${raw}"`);
	return n;
}

function validateSort(raw) {
	const s = String(raw).toLowerCase();
	if (!VALID_SORTS.includes(s)) fail("INVALID_PARAM", `comment_sort must be one of ${VALID_SORTS.join(", ")} (top=最热门/置顶, newest=最新), got "${raw}"`);
	return s;
}

function absoluteUrl(value) {
	if (!value) return null;
	try {
		return new URL(value, "https://www.youtube.com").toString();
	} catch {
		return null;
	}
}

// Extract current top-level threads from the DOM.
function extractThreads() {
	return Array.from(document.querySelectorAll("ytd-comment-thread-renderer")).map((t) => {
		const at = t.querySelector("#author-text");
		const ct = t.querySelector("#content-text");
		const vt = t.querySelector("#vote-count-middle");
		const pt = t.querySelector("#published-time-text");
		const replyBtn = Array.from(t.querySelectorAll("button")).find((b) => /条回复/.test(b.getAttribute("aria-label") || ""));
		const replyLabel = replyBtn ? replyBtn.getAttribute("aria-label") : null;
		return {
			author: at ? at.textContent.trim() : null,
			text: ct ? ct.textContent.trim() : null,
			likes: vt ? vt.textContent.trim() : null,
			publishedAt: pt ? pt.textContent.trim() : null,
			replyCount: replyLabel ? Number((replyLabel.match(/^[\d,]+/) || ["0"])[0].replace(/,/g, "")) : 0
		};
	});
}

// Load top-level comments; limit is the top-level comment cap. The first batch loads by
// scrolling the section into view, then each next batch is pulled by calling the top-level
// ytd-continuation-item-renderer.triggerContinuation() (scroll-triggered loading is unreliable
// in the daemon). Threads are deduped across partial renders.
async function loadComments(page, limit, sort, waitRandom) {
	// The comments section renders below the fold; wait for it to enter the DOM.
	await page.waitForSelector("ytd-comments#comments", { timeout: 15000 }).catch(() => {});
	const hasSection = await page.evaluate(() => Boolean(document.querySelector("ytd-comments#comments")));
	if (!hasSection) return { comments: [], partial: false };

	// Scroll the comments section into view and fire a window scroll to trigger the first batch.
	await page.evaluate(() => {
		const c = document.querySelector("ytd-comments#comments");
		if (c) {
			c.scrollIntoView({ block: "start" });
			window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - 150));
		}
	});
	await waitRandom(700, 1300);

	// Apply sort via the UI menu when newest is requested (the ?comment_sort= URL param is stripped by YouTube).
	if (sort === "newest") {
		await page.evaluate(() => {
			const menu = document.querySelector("#sort-menu");
			const btn = menu ? menu.querySelector("tp-yt-paper-button") : null;
			if (btn) btn.click();
		});
		await waitRandom(300, 700);
		await page.evaluate(() => {
			const opts = Array.from(document.querySelectorAll("[role=option]")).filter((e) => e.textContent.trim().startsWith("最新"));
			if (opts.length) opts[0].click();
		});
		await waitRandom(1000, 1700);
	}

	// Wait for the first batch of threads to finish rendering (count stops growing).
	await page.evaluate(async () => {
		const count = () => document.querySelectorAll("ytd-comment-thread-renderer").length;
		let prev = -1;
		for (let i = 0; i < 40; i++) {
			const cur = count();
			if (cur > 0 && cur === prev) return cur;
			prev = cur;
			await new Promise((r) => setTimeout(r, 250));
		}
		return count();
	});
	await waitRandom(400, 800);

	const seen = new Set();
	const comments = [];
	let emptyTriggers = 0;
	const maxTriggers = Math.ceil(limit / 20) + 4;

	for (let i = 0; i < maxTriggers && comments.length < limit; i++) {
		// Wait for the batch triggered in the previous round to render (count > lastCount).
		if (i > 0) {
			const lastCount = await page.evaluate(() => document.querySelectorAll("ytd-comment-thread-renderer").length);
			await page.waitForFunction(
				(p) => document.querySelectorAll("ytd-comment-thread-renderer").length > p,
				lastCount,
				{ timeout: 10000 }
			).catch(() => {});
		}

		const batch = await page.evaluate(extractThreads);

		let added = 0;
		for (const item of batch) {
			if (!item.text) continue;
			const key = `${item.author}|${item.text}`;
			if (!seen.has(key)) {
				seen.add(key);
				comments.push(item);
				added += 1;
			}
		}

		if (comments.length >= limit) break;

		// Trigger the next page via the top-level comment continuation item (verified reliable;
		// scroll-triggered loading is flaky in the daemon). The item sits directly in the
		// comments section, not inside a sub-thread (yt-sub-thread) which is for replies.
		const triggered = await page.evaluate(() => {
			const sec = document.querySelector("ytd-comments#comments");
			if (!sec) return false;
			const cont = Array.from(sec.querySelectorAll("ytd-continuation-item-renderer")).find(
				(el) => !el.closest("yt-sub-thread") && typeof el.triggerContinuation === "function"
			);
			if (!cont) return false;
			cont.triggerContinuation();
			return true;
		});
		if (!triggered) break;
		await waitRandom(600, 1100);

		if (added === 0) {
			emptyTriggers += 1;
			if (emptyTriggers >= 2) break;
		} else {
			emptyTriggers = 0;
		}
	}

	return { comments: comments.slice(0, limit), partial: comments.length > 0 && comments.length < limit };
}

export default async (page, params, cwd) => {
	if (!params.url || !String(params.url).trim()) fail("MISSING_PARAM", "url is required (video URL or bare video ID)");

	const videoId = extractVideoId(params.url);
	const includeComments = params.include_comments === "true";
	const waitRandom = (min, max) => page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));

	const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
	await page.goto(watchUrl, { waitUntil: "domcontentloaded" });
	// Bring the daemon's page to the foreground: as a background tab Chrome throttles the
	// IntersectionObserver, which is what triggers YouTube's lazy comment loading.
	await page.bringToFront().catch(() => {});
	await waitRandom(400, 900);

	// Random mouse movement as part of polite pacing.
	await page.mouse.move(200 + Math.floor(Math.random() * 200), 120 + Math.floor(Math.random() * 180));

	await page.waitForFunction(() => Boolean(window.ytInitialPlayerResponse), null, { timeout: 15000 }).catch(() => {});
	const present = await page.evaluate(() => Boolean(window.ytInitialPlayerResponse));
	if (!present) {
		const bodyText = await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 400) : ""));
		if (/不可用|unavailable|Video unavailable/i.test(bodyText)) {
			fail("NOT_FOUND", `Video ${videoId} is unavailable or does not exist`);
		}
		fail("DRIFT_DETECTED", `ytInitialPlayerResponse not found on ${watchUrl}`);
	}

	// The owner section (channel name/subscriber count) and action buttons render slightly
	// after ytInitialPlayerResponse; wait for them so like count / channel fields are present.
	await page.waitForFunction(
		() => Boolean(document.querySelector("ytd-channel-name a")) && document.querySelectorAll("#top-level-buttons-computed button[aria-pressed]").length > 0,
		null,
		{ timeout: 12000 }
	).catch(() => {});
	await waitRandom(200, 500);

	const meta = await page.evaluate(() => {
		const p = window.ytInitialPlayerResponse;
		const vd = p.videoDetails || {};
		const mm = (p.microformat && p.microformat.playerMicroformatRenderer) || {};
		const textOf = (x) => Array.isArray(x) ? x.map((r) => r.text || "").join("") : (typeof x === "string" ? x : (x && x.simpleText) || null);
		const qa = (s) => Array.from(document.querySelectorAll(s));
		const likeBtn = qa("#top-level-buttons-computed button[aria-pressed]").find((b) => {
			const label = (b.getAttribute("aria-label") || "").toLowerCase();
			return label.includes("顶此视频") || (label.includes("like") && !label.includes("dislike"));
		});
		const likeLabel = likeBtn ? likeBtn.getAttribute("aria-label") : null;
		const likeMatch = likeLabel ? likeLabel.match(/[0-9][0-9,]*/) : null;
		const ownerLink = document.querySelector("ytd-channel-name a");
		const sub = document.querySelector("#owner-sub-count") || document.querySelector("#owner #subscriber-count");
		return {
			videoId: vd.videoId || null,
			title: vd.title || null,
			author: vd.author || null,
			channelId: vd.channelId || null,
			views: vd.viewCount != null ? String(vd.viewCount) : null,
			duration: vd.lengthSeconds != null ? Number(vd.lengthSeconds) : null,
			isLive: vd.isLiveContent === true || vd.isLive === true,
			description: textOf(vd.shortDescription) || null,
			publishDate: mm.publishDate || null,
			category: mm.category || null,
			ownerHref: ownerLink ? ownerLink.getAttribute("href") : null,
			subscribers: sub ? sub.textContent.trim() : null,
			likes: likeMatch ? Number(likeMatch[0].replace(/,/g, "")) : 0
		};
	});

	const ownerHref = absoluteUrl(meta.ownerHref);
	let handle = null;
	if (ownerHref) {
		const m = ownerHref.match(/\/@([A-Za-z0-9_.-]+)/);
		if (m) handle = "@" + m[1];
	}

	const output = {
		video: {
			videoId: meta.videoId || videoId,
			title: meta.title,
			url: watchUrl,
			channel: {
				name: meta.author,
				handle,
				channelId: meta.channelId,
				url: ownerHref,
				subscribers: meta.subscribers
			},
			views: meta.views,
			likes: meta.likes,
			publishDate: meta.publishDate,
			duration: meta.duration,
			category: meta.category,
			description: meta.description,
			isLive: meta.isLive
		}
	};

	if (!includeComments) return output;

	const commentLimit = parseCommentLimit(params.comment_limit);
	const sort = validateSort(params.comment_sort);
	const commentResult = await loadComments(page, commentLimit, sort, waitRandom);
	output.comments = commentResult.comments;
	output.partial = commentResult.partial;
	return output;
};
