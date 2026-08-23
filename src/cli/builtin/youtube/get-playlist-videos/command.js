const MAX_LIMIT = 100;

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function textOf(value) {
	if (value == null) return null;
	if (typeof value === "string") return value;
	if (Array.isArray(value.runs)) return value.runs.map((run) => run.text || "").join("");
	if (typeof value.simpleText === "string") return value.simpleText;
	if (typeof value.content === "string") return value.content;
	return null;
}

function extractListId(input) {
	if (!input) return null;
	const trimmed = String(input).trim();
	if (!trimmed) return null;
	const looksLikeUrl = /^https?:\/\//i.test(trimmed) || trimmed.includes("/playlist") || trimmed.includes("list=");
	if (looksLikeUrl) {
		try {
			const parsed = new URL(trimmed);
			const list = parsed.searchParams.get("list");
			if (list) return list;
		} catch {
			/* not a strict URL, fall through to regex */
		}
		const match = trimmed.match(/[?&]list=([^&#]+)/);
		if (match) return decodeURIComponent(match[1]);
		return null;
	}
	return trimmed;
}

function lockupToItem(lvm) {
	if (!lvm || lvm.contentType !== "LOCKUP_CONTENT_TYPE_VIDEO" || !lvm.contentId) return null;
	const model = lvm.metadata?.lockupMetadataViewModel;
	const title = textOf(model?.title);
	const rows = model?.metadata?.contentMetadataViewModel?.metadataRows || [];
	const channel = rows[0]?.metadataParts?.map((part) => textOf(part.text)).find(Boolean) || null;
	const overlays = lvm.contentImage?.thumbnailViewModel?.overlays || [];
	let duration = null;
	for (const overlay of overlays) {
		const badges = overlay.thumbnailBottomOverlayViewModel?.badges || [];
		for (const badge of badges) {
			const badgeText = badge.thumbnailBadgeViewModel?.text;
			if (badgeText && /^\d{1,3}:\d{2}(?::\d{2})?$/.test(badgeText)) {
				duration = badgeText;
				break;
			}
		}
		if (duration) break;
	}
	return {
		videoId: lvm.contentId,
		title: title || null,
		url: `https://www.youtube.com/watch?v=${lvm.contentId}`,
		duration,
		channel: channel || null
	};
}

function findPlaylistSection(data) {
	const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
	if (!tabs) return null;
	for (const tab of tabs) {
		const sectionList = tab?.tabRenderer?.content?.sectionListRenderer;
		if (sectionList) return sectionList;
	}
	return null;
}

function collectPage(data, scope) {
	if (!data || typeof data !== "object") return { schemaOk: false, items: [] };
	const items = [];
	const seenIds = new Set();
	const visited = new Set();
	function visit(value, skipShelf) {
		if (!value || typeof value !== "object" || visited.has(value)) return;
		visited.add(value);
		if (value.lockupViewModel && !skipShelf) {
			const item = lockupToItem(value.lockupViewModel);
			if (item && !seenIds.has(item.videoId)) {
				seenIds.add(item.videoId);
				items.push(item);
			}
		}
		for (const [key, item] of Object.entries(value)) {
			visit(item, skipShelf || key === "horizontalShelfViewModel");
		}
	}
	visit(scope || data, false);
	return {
		schemaOk: Boolean(data.contents || data.onResponseReceivedActions || data.responseContext || data.header),
		items
	};
}

function extractHeader(data) {
	const vm = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel;
	if (vm) {
		const title = textOf(vm.title?.dynamicTextViewModel?.text) || null;
		const rows = vm.metadata?.contentMetadataViewModel?.metadataRows || [];
		let channel = null;
		const channelPart = rows[0]?.metadataParts?.[0];
		if (channelPart?.avatarStack) {
			const avatarText = channelPart.avatarStack.avatarStackViewModel.text;
			const browse = avatarText?.commandRuns?.[0]?.onTap?.innertubeCommand?.browseEndpoint;
			const rawName = textOf(avatarText) || null;
			channel = {
				name: rawName ? rawName.replace(/^创建者：/, "").replace(/^Creator:\s*/i, "") : null,
				url: browse?.canonicalBaseUrl ? `https://www.youtube.com${browse.canonicalBaseUrl}` : null,
				channelId: browse?.browseId || null
			};
		}
		const statTexts = (rows[1]?.metadataParts || []).map((part) => textOf(part.text)).filter(Boolean);
		const countText = statTexts.find((text) => /个视频/.test(text)) || null;
		const countMatch = countText ? countText.match(/(\d+)/) : null;
		return { kind: "pageHeaderViewModel", title, channel, videoCount: countMatch ? Number(countMatch[1]) : null };
	}
	const header = data?.header?.playlistHeaderRenderer;
	if (header) {
		const title = textOf(header.title) || null;
		const owner = textOf(header.ownerText) || null;
		const browse = header.ownerEndpoint?.browseEndpoint;
		const stats = (header.stats || []).map((stat) => textOf(stat)).filter(Boolean);
		const numText = textOf(header.numVideosText) || "";
		const countMatch = numText.match(/(\d+)/);
		let videoCount = null;
		if (countMatch) videoCount = Number(countMatch[1]);
		else if (numText === "无视频" || stats.includes("无视频")) videoCount = 0;
		return {
			kind: "playlistHeaderRenderer",
			title,
			channel: {
				name: owner,
				url: browse?.canonicalBaseUrl ? `https://www.youtube.com${browse.canonicalBaseUrl}` : null,
				channelId: browse?.browseId || null
			},
			videoCount
		};
	}
	return null;
}

async function browserSnapshot(page) {
	return page.evaluate(() => {
		const data = window.ytInitialData;
		return { data };
	});
}

async function loginState(page) {
	return page.evaluate(() => {
		const body = document.body.innerText || "";
		const tabContent = window.ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content;
		return {
			signInPrompt: /登录|Sign in|Sign in to|登录以|登录后/.test(body),
			hasAvatar: !!document.querySelector("ytd-account-chip, #avatar-btn, ytd-topbar-menu-button-renderer img"),
			notFound: /not found|不存在|找不到|无法播放|无法查看|不可用|unavailable|播放列表为空/i.test(body),
			bodySnippet: body.replace(/\s+/g, " ").trim().slice(0, 300),
			title: document.title,
			tabContentKeys: tabContent ? Object.keys(tabContent) : null
		};
	});
}

async function extractDomItems(page) {
	return page.evaluate(() => {
		const out = [];
		const seen = new Set();
		const txt = (el) => (el?.textContent || el?.innerText || "").replace(/\s+/g, " ").trim() || null;
		for (const el of document.querySelectorAll("yt-lockup-view-model")) {
			// skip recommended-playlist lockups (they render a video thumbnail that links to their first video)
			if (el.querySelector('[class*="content-id-PL"]')) continue;
			const anchor = el.querySelector("a[href*='/watch?v=']");
			const href = anchor?.getAttribute("href") || "";
			const match = href.match(/[?&]v=([A-Za-z0-9_-]{11})/);
			if (!match || seen.has(match[1])) continue;
			seen.add(match[1]);
			const text = txt(el) || "";
			const durEl = el.querySelector("ytd-thumbnail-overlay-time-status-renderer, [class*='time-status'], [class*='time_and_badge'], [class*='badge']");
			let duration = null;
			if (durEl) {
				const durText = txt(durEl);
				if (durText && /^\d{1,3}:\d{2}/.test(durText)) duration = durText;
			}
			if (!duration) {
				const anyMatch = text.match(/\b\d{1,3}:\d{2}(?::\d{2})?\b/);
				if (anyMatch) duration = anyMatch[0];
			}
			const titleEl = el.querySelector("a[title], #video-title, a#video-title-link, h3 a");
			const channelEl = el.querySelector("a[href*='/@'], a[href*='/channel/']");
			out.push({
				videoId: match[1],
				title: txt(titleEl) || null,
				url: `https://www.youtube.com/watch?v=${match[1]}`,
				duration,
				channel: channelEl ? txt(channelEl) : null
			});
		}
		return out;
	});
}

async function scrollLoadMore(page, waitRandom) {
	const height = await page.evaluate(() => window.innerHeight);
	await page.mouse.move(60 + Math.floor(Math.random() * 120), 20 + Math.floor(Math.random() * 80));
	await waitRandom(200, 400);
	for (let i = 0; i < 8; i++) {
		await page.evaluate((h) => window.scrollBy(0, h * 0.8), height);
		await waitRandom(220, 400);
	}
	await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
	await waitRandom(1400, 1900);
}

export default async (page, params, cwd) => {
	const rawUrl = String(params.url || "").trim();
	if (!rawUrl) fail("MISSING_PARAM", "url is required (playlist URL or list ID)");
	const listId = extractListId(rawUrl);
	if (!listId) fail("INVALID_PARAM", "unable to extract a list ID from url (expected youtube.com/playlist?list=... or a bare ID like PL..., UU..., WL, LL)");
	const limitRaw = String(params.limit);
	if (!/^\d+$/.test(limitRaw)) fail("INVALID_PARAM", "limit must be a positive integer");
	const limit = Number(limitRaw);
	if (!Number.isSafeInteger(limit) || limit < 1) fail("INVALID_PARAM", "limit must be a positive integer");
	if (limit > MAX_LIMIT) fail("LIMIT_EXCEEDED", `limit ${limit} exceeds maxLimit ${MAX_LIMIT}`);

	const targetUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
	const waitRandom = (min, max) => page.waitForTimeout(min + Math.floor(Math.random() * (max - min + 1)));

	let apiFailure = null;
	try {
		await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
		await page.bringToFront();
		await waitRandom(400, 800);
		const finalUrl = page.url();
		if (!finalUrl.includes("/playlist")) {
			if (/(accounts\.google\.com|\/signin)/i.test(finalUrl)) fail("AUTH_REQUIRED", "playlist requires login (WL/LL and private playlists need a logged-in session)");
			fail("NOT_FOUND", `playlist not found or invalid list ID: ${listId}`);
		}
		await page.waitForFunction(() => Boolean(window.ytInitialData), null, { timeout: 20000 }).catch(() => {});
		await page.waitForTimeout(1500);

		const first = await browserSnapshot(page);
		const header = extractHeader(first.data);
		if (!header) {
			const state = await loginState(page);
			if (state.signInPrompt && !state.hasAvatar) fail("AUTH_REQUIRED", "playlist requires login (WL/LL and private playlists need a logged-in session)");
			if (state.notFound) fail("NOT_FOUND", `playlist not found or invalid list ID: ${listId}`);
			if (state.title === "YouTube" || !state.tabContentKeys) fail("NOT_FOUND", `playlist not found or invalid list ID: ${listId}`);
			fail("DRIFT_DETECTED", `playlist header renderer not found on /playlist page (title="${state.title}", tabContentKeys=${JSON.stringify(state.tabContentKeys)})`);
		}
		const pageData = collectPage(first.data, findPlaylistSection(first.data));
		if (!pageData.schemaOk) throw new Error("ytInitialData schema missing");

		const items = [...pageData.items];
		const shouldScroll = header.videoCount == null || items.length < header.videoCount;
		let rounds = 0;
		while (items.length < limit && shouldScroll && rounds < 4) {
			const before = items.length;
			await scrollLoadMore(page, waitRandom);
			const domItems = await extractDomItems(page);
			for (const item of domItems) {
				if (!items.some((existing) => existing.videoId === item.videoId)) items.push(item);
			}
			rounds += 1;
			if (items.length <= before) break;
		}
		await waitRandom(0, 350);
		const sliced = items.slice(0, limit);
		return {
			playlist: {
				id: listId,
				title: header.title,
				url: targetUrl,
				channel: header.channel,
				videoCount: header.videoCount
			},
			items: sliced,
			partial: items.length < limit,
			resultCount: sliced.length,
			source: "ytInitialData",
			pagesFetched: rounds,
			maxLimit: MAX_LIMIT
		};
	} catch (error) {
		if (error?.code) throw error;
		apiFailure = error instanceof Error ? error.message : String(error);
	}

	try {
		await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
		await page.bringToFront();
		await waitRandom(400, 800);
		const finalUrl = page.url();
		if (!finalUrl.includes("/playlist")) {
			if (/(accounts\.google\.com|\/signin)/i.test(finalUrl)) fail("AUTH_REQUIRED", "playlist requires login (WL/LL and private playlists need a logged-in session)");
			fail("NOT_FOUND", `playlist not found or invalid list ID: ${listId}`);
		}
		await scrollLoadMore(page, waitRandom);
		const fallbackItems = await extractDomItems(page);
		const title = await page.title();
		return {
			playlist: {
				id: listId,
				title: title.replace(/ - YouTube$/, "") || null,
				url: targetUrl,
				channel: null,
				videoCount: null
			},
			items: fallbackItems.slice(0, limit),
			partial: true,
			resultCount: Math.min(fallbackItems.length, limit),
			source: "dom",
			fallbackUsed: true,
			fallbackReason: apiFailure || "ytInitialData unavailable"
		};
	} catch (error) {
		if (error?.code) throw error;
		fail("DRIFT_DETECTED", `YouTube playlist page data and DOM extraction failed: ${apiFailure || error.message}`);
	}
};
