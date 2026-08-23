// youtube/channel-videos — list a YouTube channel's content by tab with sorting.
// Data path: window.ytInitialData (tabs + richGridRenderer / sectionListRenderer) with
// continuation via /youtubei/v1/browse, plus a DOM scroll fallback.

const MAX_LIMIT = 100;
const VALID_TABS = ["videos", "shorts", "live", "posts"];
const VALID_SORTS = ["latest", "popular", "oldest"];
const TAB_PATH = { videos: "videos", shorts: "shorts", live: "streams", posts: "posts" };
const SORT_TEXT = { latest: "最新", popular: "最热门", oldest: "最早" };
const SORT_TEXTS = ["最新", "最热门", "最早"];

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
	if (Array.isArray(value.content)) return value.content.map((part) => (typeof part === "string" ? part : textOf(part) || "")).join("") || null;
	if (typeof value.text === "string") return value.text;
	if (value.text && typeof value.text === "object") return textOf(value.text);
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

// Normalize the channel argument to a channel base URL (no tab path).
function resolveChannelUrl(channel) {
	let c = channel.trim();
	if (/^https?:\/\//i.test(c)) {
		let m = c.match(/^(https?:\/\/[^/]+)(\/@[^/?#]+)/);
		if (!m) m = c.match(/^(https?:\/\/[^/]+)(\/channel\/UC[\w-]+)/);
		if (m) return m[1] + m[2];
		return c.replace(/[?#].*$/, "").replace(/\/+$/, "");
	}
	if (c.startsWith("/")) return "https://www.youtube.com" + c.replace(/[?#].*$/, "").replace(/\/+$/, "");
	if (c.startsWith("@")) return "https://www.youtube.com/" + c;
	if (/^UC[\w-]{22}$/.test(c)) return "https://www.youtube.com/channel/" + c;
	return "https://www.youtube.com/" + (c.startsWith("@") ? c : "@" + c);
}

function parseTabs(data) {
	const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
	return tabs
		.map((t) => {
			const tr = t.tabRenderer || t.expandableTabRenderer || {};
			const url = tr.endpoint?.commandMetadata?.webCommandMetadata?.url || "";
			const path = url.split("?")[0].split("/").filter(Boolean).pop() || "";
			return { title: tr.title, url, path, selected: tr.selected || false };
		})
		.filter((t) => t.url);
}

function channelHeader(data) {
	const hdr = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
	const name = textOf(hdr?.title) || data?.metadata?.channelMetadataRenderer?.title || null;
	const rows = hdr?.metadata?.contentMetadataViewModel?.metadataRows || [];
	let handle = null;
	for (const r of rows) {
		const parts = (r.metadataParts || []).map((p) => textOf(p.text)).filter(Boolean);
		if (parts[0]?.startsWith("@")) {
			handle = parts[0];
			break;
		}
	}
	return { name, handle };
}

function lockupItem(l, tab) {
	const videoId = l.contentId || null;
	if (!videoId) return null;
	const title = textOf(l.title) || textOf(l.metadata?.lockupMetadataViewModel?.title) || null;
	const md = l.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel;
	const parts = md ? (md.metadataRows || []).flatMap((r) => (r.metadataParts || []).map((p) => textOf(p.text))).filter(Boolean) : [];
	// Metadata parts can include an extra creator name (e.g. joint videos), so select by pattern rather than fixed index.
	const views = parts.find((p) => /观看|播放/.test(p)) || null;
	const publishedAt = parts.find((p) => /直播时间|前$/.test(p)) || null;
	let duration = null;
	const overlays = l.contentImage?.thumbnailViewModel?.overlays || [];
	for (const ov of overlays) {
		const badges = ov.thumbnailBottomOverlayViewModel?.badges || [];
		for (const b of badges) {
			const t = b.thumbnailBadgeViewModel?.text;
			if (t && /^[\d:]+$/.test(t)) {
				duration = t;
				break;
			}
		}
		if (duration) break;
	}
	return {
		videoId,
		title,
		url: absoluteUrl(`/watch?v=${videoId}`),
		type: tab === "live" ? "live" : "video",
		duration,
		views,
		publishedAt
	};
}

function shortsItem(s) {
	const videoId = s.entityId?.replace(/^shorts-shelf-item-/, "") || s.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId || null;
	if (!videoId) return null;
	const title = textOf(s.overlayMetadata?.primaryText) || null;
	const views = textOf(s.overlayMetadata?.secondaryText) || null;
	return { videoId, title, url: absoluteUrl(`/shorts/${videoId}`), type: "short", views };
}

function postItem(p) {
	const postId = p.postId || null;
	if (!postId) return null;
	const text = (p.contentText?.runs || []).map((r) => r.text || "").join("") || null;
	const publishedAt = textOf(p.publishedTimeText) || null;
	const likes = p.voteCount?.simpleText || null;
	return { videoId: postId, title: text, url: absoluteUrl(`/post/${postId}`), type: "post", likes, publishedAt };
}

function addItem(items, keys, item) {
	const key = `${item.type}:${item.videoId}`;
	if (keys.has(key)) return;
	keys.add(key);
	items.push(item);
}

// Extract items + continuation token from a contents array (rich grid or item section).
function extractFromContents(contents, tab, items, keys, tokenObj) {
	for (const c of contents || []) {
		if (c.richItemRenderer?.content?.lockupViewModel) {
			const it = lockupItem(c.richItemRenderer.content.lockupViewModel, tab);
			if (it?.videoId) addItem(items, keys, it);
		} else if (c.richItemRenderer?.content?.shortsLockupViewModel) {
			const it = shortsItem(c.richItemRenderer.content.shortsLockupViewModel);
			if (it?.videoId) addItem(items, keys, it);
		} else if (c.backstagePostThreadRenderer?.post?.backstagePostRenderer) {
			const it = postItem(c.backstagePostThreadRenderer.post.backstagePostRenderer);
			if (it?.videoId) addItem(items, keys, it);
		} else if (c.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) {
			tokenObj.token = c.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
		}
	}
}

function extractFromSectionList(slr, tab, items, keys, tokenObj) {
	for (const sec of slr?.contents || []) {
		if (sec.itemSectionRenderer) extractFromContents(sec.itemSectionRenderer.contents, tab, items, keys, tokenObj);
		else if (sec.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token) tokenObj.token = sec.continuationItemRenderer.continuationEndpoint.continuationCommand.token;
	}
}

// Collect items and continuation token, scoped to the selected tab's content and to
// continuation responses. A blind recursive visit can pick up unrelated tokens
// (e.g. a channel-featured token) which resolves to the wrong page.
function collect(data, tab) {
	const items = [];
	const keys = new Set();
	const tokenObj = { token: null };
	const schemaOk = Boolean(data && (data.contents || data.onResponseReceivedActions || data.onResponseReceivedEndpoints || data.continuationContents || data.responseContext));
	if (data.contents?.twoColumnBrowseResultsRenderer) {
		const browse = data.contents.twoColumnBrowseResultsRenderer;
		const selected = (browse.tabs || []).find((t) => (t.tabRenderer || {}).selected) || (browse.tabs || [])[0];
		const content = selected?.tabRenderer?.content || selected?.expandableTabRenderer?.content || {};
		if (content.richGridRenderer) extractFromContents(content.richGridRenderer.contents, tab, items, keys, tokenObj);
		if (content.sectionListRenderer) extractFromSectionList(content.sectionListRenderer, tab, items, keys, tokenObj);
	}
	if (data.onResponseReceivedActions || data.onResponseReceivedEndpoints || data.continuationContents) {
		const endpoint = (data.onResponseReceivedActions || data.onResponseReceivedEndpoints || [])[0];
		const itemsAction = endpoint?.appendContinuationItemsAction;
		if (itemsAction) extractFromContents(itemsAction.continuationItems, tab, items, keys, tokenObj);
		if (data.continuationContents?.richGridRenderer) extractFromContents(data.continuationContents.richGridRenderer.contents, tab, items, keys, tokenObj);
		if (data.continuationContents?.sectionListRenderer) extractFromSectionList(data.continuationContents.sectionListRenderer, tab, items, keys, tokenObj);
	}
	return { items, token: tokenObj.token, schemaOk };
}

function itemKey(item) {
	return `${item.type}:${item.videoId}`;
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

// Apply the requested sort for video-type tabs. videos uses a dropdown sheet;
// shorts/live render direct chips. Sort does not change the URL.
async function applySort(page, sort) {
	const target = SORT_TEXT[sort];
	if (!target) return;
	// wait for the sort chip bar to render before interacting
	await page
		.waitForFunction(
			() => Array.from(document.querySelectorAll("chip-view-model")).some((c) => ["最新", "最热门", "最早"].includes(c.textContent.trim())),
			null,
			{ timeout: 10000 }
		)
		.catch(() => {});
	// capture the first item id from ytInitialData to detect the reorder
	const firstIdExpr = `(() => {
		const d = window.ytInitialData;
		const browse = d && d.contents && d.contents.twoColumnBrowseResultsRenderer;
		const tabs = browse && browse.tabs || [];
		const sel = tabs.find(t => (t.tabRenderer || {}).selected) || tabs[0];
		const grid = sel && sel.tabRenderer && sel.tabRenderer.content && sel.tabRenderer.content.richGridRenderer;
		const c0 = grid && grid.contents && grid.contents[0] && grid.contents[0].richItemRenderer && grid.contents[0].richItemRenderer.content;
		return (c0 && c0.lockupViewModel && c0.lockupViewModel.contentId) || (c0 && c0.shortsLockupViewModel && c0.shortsLockupViewModel.entityId) || null;
	})()`;
	const beforeFirst = await page.evaluate(firstIdExpr);
	const chips = await page.evaluate(() =>
		Array.from(document.querySelectorAll("chip-view-model")).map((c) => c.textContent.trim()).filter(Boolean)
	);
	const presentSortChips = chips.filter((t) => SORT_TEXTS.includes(t));
	if (presentSortChips.includes(target)) {
		await page.evaluate((text) => {
			const chip = Array.from(document.querySelectorAll("chip-view-model")).find((c) => c.textContent.trim() === text);
			const btn = chip && chip.querySelector("button");
			if (btn) btn.click();
		}, target);
	} else {
		await page.evaluate(() => {
			const chip = Array.from(document.querySelectorAll("chip-view-model")).find((c) => ["最新", "最热门", "最早"].includes(c.textContent.trim()));
			const btn = chip && chip.querySelector("button");
			if (btn) btn.click();
		});
		await page.waitForSelector("yt-list-item-view-model", { timeout: 5000 }).catch(() => {});
		await page.evaluate((text) => {
			const item = Array.from(document.querySelectorAll("yt-list-item-view-model")).find((el) => el.textContent.trim() === text);
			if (item) (item.querySelector("button") || item).click();
		}, target);
	}
	// wait for ytInitialData to re-fetch in the new order (first item id changes)
	if (beforeFirst) {
		await page
			.waitForFunction(
				(prev) => {
					const d = window.ytInitialData;
					const browse = d && d.contents && d.contents.twoColumnBrowseResultsRenderer;
					const tabs = (browse && browse.tabs) || [];
					const sel = tabs.find((t) => (t.tabRenderer || {}).selected) || tabs[0];
					const grid = sel && sel.tabRenderer && sel.tabRenderer.content && sel.tabRenderer.content.richGridRenderer;
					const c0 = grid && grid.contents && grid.contents[0] && grid.contents[0].richItemRenderer && grid.contents[0].richItemRenderer.content;
					const cur = (c0 && c0.lockupViewModel && c0.lockupViewModel.contentId) || (c0 && c0.shortsLockupViewModel && c0.shortsLockupViewModel.entityId) || null;
					return cur && cur !== prev;
				},
				beforeFirst,
				{ timeout: 12000 }
			)
			.catch(() => {});
	}
	await page.waitForTimeout(400 + Math.floor(Math.random() * 500));
}

async function detectChannelError(page, data) {
	if (data?.alerts) {
		const alerts = JSON.stringify(data.alerts);
		if (/channel|不存在|not found/i.test(alerts)) fail("NOT_FOUND", "channel not found");
	}
	const body = await page.evaluate(() => (document.body.innerText || "").slice(0, 800));
	if (/channel doesn't exist|channel 不存在|此频道不存在|找不到|无法找到|没有找到|not found/i.test(body)) {
		fail("NOT_FOUND", `channel not found: ${body.slice(0, 120).replace(/\s+/g, " ")}`);
	}
	fail("DRIFT_DETECTED", "channel page has no tabs and no recognizable content");
}

// DOM scroll fallback when ytInitialData is unavailable or continuation fails.
async function domExtract(page, tab, limit) {
	const items = [];
	const seen = new Set();
	let guard = 0;
	let lastCount = -1;
	const abs = (u) => {
		try {
			return new URL(u, "https://www.youtube.com").toString();
		} catch {
			return null;
		}
	};
	while (items.length < limit && guard < 16) {
		const viewport = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
		await page.mouse.move(Math.floor(Math.random() * viewport.w), Math.floor(Math.random() * viewport.h));
		await page.mouse.wheel(0, 500 + Math.floor(Math.random() * 500));
		await page.waitForTimeout(350 + Math.floor(Math.random() * 500));
		const batch = await page.evaluate(({ t, max, absSrc }) => {
			const out = [];
			const txt = (el) => (el?.innerText || el?.textContent || "").trim() || null;
			const absu = (u) => {
				try {
					return new URL(u, absSrc).toString();
				} catch {
					return null;
				}
			};
			if (t === "posts") {
				for (const item of document.querySelectorAll("ytd-backstage-post-renderer")) {
					const link = item.querySelector("a[href*='/post/']");
					const href = link?.getAttribute("href");
					if (!href) continue;
					const postId = href.split("/post/")[1]?.split(/[?#]/)[0];
					if (!postId) continue;
					out.push({
						videoId: postId,
						title: txt(item)?.slice(0, 300) || null,
						url: absu(`/post/${postId}`),
						type: "post",
						likes: null,
						publishedAt: null
					});
				}
			} else {
				for (const item of document.querySelectorAll("ytd-rich-item-renderer")) {
					const lockup = item.querySelector("yt-lockup-view-model");
					if (!lockup) continue;
					const link = lockup.querySelector("a.ytLockupViewModelContentLink, a[href*='/watch?v=']:not(.ytLockupViewModelContentImage), a[href*='/shorts/']");
					const href = link?.getAttribute("href") || "";
					const m = href.match(/(?:watch\?v=|\/shorts\/)([\w-]{11})/);
					const videoId = m ? m[1] : null;
					if (!videoId) continue;
					const title = txt(link) || null;
					const lines = (lockup.innerText || "").split("\n").map((s) => s.trim()).filter(Boolean);
					if (t === "short") {
						out.push({ videoId, title, url: absu(`/shorts/${videoId}`), type: "short", views: lines[1] || null });
					} else {
						const duration = /^[\d:]+$/.test(lines[0] || "") ? lines[0] : null;
						out.push({
							videoId,
							title,
							url: absu(`/watch?v=${videoId}`),
							type: t === "live" ? "live" : "video",
							duration,
							views: lines[2] || null,
							publishedAt: lines[4] || null
						});
					}
				}
			}
			return out.slice(0, max);
		}, { t: tab, max: limit, absSrc: "https://www.youtube.com" });
		for (const r of batch) {
			const k = `${r.type}:${r.videoId}`;
			if (!seen.has(k)) {
				seen.add(k);
				items.push(r);
			}
		}
		const atBottom = await page.evaluate(() => {
			const s = document.scrollingElement || document.documentElement;
			return s.scrollHeight - s.scrollTop - window.innerHeight < 250;
		});
		if (atBottom && items.length === lastCount) break;
		lastCount = items.length;
		guard += 1;
	}
	return items.slice(0, limit);
}

export default async (page, params, cwd) => {
	const channel = String(params.channel || "").trim();
	if (!channel) fail("MISSING_PARAM", "channel is required");
	const tab = String(params.tab).toLowerCase();
	if (!VALID_TABS.includes(tab)) fail("INVALID_PARAM", `tab must be one of ${VALID_TABS.join(", ")}`);
	const sort = String(params.sort).toLowerCase();
	if (!VALID_SORTS.includes(sort)) fail("INVALID_PARAM", `sort must be one of ${VALID_SORTS.join(", ")}`);
	const limitRaw = String(params.limit);
	if (!/^\d+$/.test(limitRaw)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(limitRaw);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

	const waitRandom = (min, max) => page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));
	const baseUrl = resolveChannelUrl(channel);
	const tabPath = TAB_PATH[tab];
	const url = `${baseUrl}/${tabPath}`;
	const ignoredParams = [];
	if (tab === "posts" && sort !== "latest") ignoredParams.push(`sort=${sort}`);

	let apiFailure = null;
	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await waitRandom(400, 900);
		const early = await page.evaluate(() => {
			const title = document.title || "";
			const body = (document.body?.innerText || "").slice(0, 600);
			return { title, body };
		});
		if (/404|not found|不存在|找不到/i.test(early.title) || /channel doesn't exist|此频道不存在|频道不存在|找不到该频道|没有找到|not found|page isn't available/i.test(early.body)) {
			fail("NOT_FOUND", `channel not found: ${early.title || early.body.slice(0, 80).replace(/\s+/g, " ")}`);
		}
		await page.waitForFunction(() => Boolean(window.ytInitialData), null, { timeout: 10000 });
		const first = await browserSnapshot(page);
		const tabs = parseTabs(first.data);
		if (!tabs.length) await detectChannelError(page, first.data);
		const availablePaths = tabs.map((t) => t.path).filter(Boolean);
		if (!availablePaths.includes(tabPath)) {
			fail("TAB_UNAVAILABLE", `tab '${tab}' is not available on channel ${channel}. Available tabs: ${availablePaths.join(", ")}`);
		}
		if (tab !== "posts" && sort !== "latest") await applySort(page, sort);

		const snap = await browserSnapshot(page);
		let pageData = collect(snap.data, tab);
		if (!pageData.schemaOk) throw new Error("ytInitialData schema missing");
		const records = [];
		const seen = new Set();
		for (const item of pageData.items) {
			const k = itemKey(item);
			if (!seen.has(k)) {
				seen.add(k);
				records.push(item);
			}
		}
		const tokens = new Set();
		let token = pageData.token;
		let pages = 1;
		const apiKey = snap.apiKey;
		const context = snap.context;
		while (records.length < limit && token && pages < 10 && !tokens.has(token)) {
			tokens.add(token);
			await waitRandom(300, 750);
			const next = await page.evaluate(
				async ({ apiKey: key, context: ctx, continuation }) => {
					const response = await fetch(`/youtubei/v1/browse?key=${encodeURIComponent(key)}`, {
						method: "POST",
						headers: { "content-type": "application/json" },
						credentials: "include",
						body: JSON.stringify({ context: ctx, continuation })
					});
					if (!response.ok) throw new Error(`continuation HTTP ${response.status}`);
					return response.json();
				},
				{ apiKey, context, continuation: token }
			);
			const nextData = collect(next, tab);
			if (!nextData.schemaOk) throw new Error("continuation schema missing");
			for (const item of nextData.items) {
				const k = itemKey(item);
				if (!seen.has(k)) {
					seen.add(k);
					records.push(item);
				}
			}
			token = nextData.token;
			pages += 1;
		}
		await waitRandom(0, 500);
		const header = channelHeader(snap.data);
		const channelOut = {
			name: header.name,
			handle: header.handle,
			url: header.handle ? absoluteUrl(`/${header.handle}`) : baseUrl
		};
		const output = {
			channel: channelOut,
			items: records.slice(0, limit),
			partial: records.length < limit,
			count: Math.min(records.length, limit),
			source: "ytInitialData",
			fallbackUsed: false,
			pagesFetched: pages
		};
		if (ignoredParams.length) output.ignoredParams = ignoredParams;
		return output;
	} catch (error) {
		apiFailure = error instanceof Error ? error.message : String(error);
		if (error?.code && error.code !== "DRIFT_DETECTED") throw error;
	}

	// DOM scroll fallback
	try {
		await page.goto(url, { waitUntil: "domcontentloaded" });
		await waitRandom(300, 700);
		const containerSel = tab === "posts" ? "ytd-backstage-post-renderer" : "ytd-rich-item-renderer";
		await page.waitForSelector(containerSel, { timeout: 7000 }).catch(() => {});
		const items = await domExtract(page, tab, limit);
		if (!items.length) {
			const body = await page.evaluate(() => (document.body.innerText || "").slice(0, 500));
			if (/channel doesn't exist|channel 不存在|此频道不存在|找不到|not found/i.test(body)) {
				fail("NOT_FOUND", `channel not found: ${body.slice(0, 120).replace(/\s+/g, " ")}`);
			}
			fail("DRIFT_DETECTED", `YouTube page data and DOM extraction failed: ${apiFailure || "no records"}`);
		}
		await waitRandom(0, 500);
		const data2 = await page.evaluate(() => window.ytInitialData);
		const header = channelHeader(data2);
		const output = {
			channel: { name: header.name, handle: header.handle, url: header.handle ? absoluteUrl(`/${header.handle}`) : baseUrl },
			items,
			partial: items.length < limit,
			count: items.length,
			source: "dom",
			fallbackUsed: true,
			fallbackReason: apiFailure || "ytInitialData unavailable"
		};
		if (ignoredParams.length) output.ignoredParams = ignoredParams;
		return output;
	} catch (error) {
		if (error?.code) throw error;
		fail("DRIFT_DETECTED", `YouTube page data and DOM extraction failed: ${apiFailure || error.message}`);
	}
};
