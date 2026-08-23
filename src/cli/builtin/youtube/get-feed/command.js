// Human-like interaction + YouTube homepage feed extraction.
// Primary path: window.ytInitialData (lockupViewModel / legacy videoRenderer).
// DOM fallback: yt-lockup-view-model (current structure, ads skipped).
// Tab chip bar is personalized/dynamic — matched at runtime; mismatch -> TAB_NOT_FOUND with available chips.
export default async (page, params, cwd) => {
	// ---------- parameter validation (before any navigation) ----------
	const fail = (code, message) => {
		const error = new Error(`[${code}] ${message}`);
		error.code = code;
		throw error;
	};

	const limitRaw = String(params.limit).trim();
	if (!/^\d+$/.test(limitRaw)) fail("INVALID_PARAM", "limit must be a positive integer between 1 and 100");
	const limit = parseInt(limitRaw, 10);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
		fail("INVALID_PARAM", `limit must be between 1 and 100, got ${limitRaw}`);
	}

	const tab =
		params.tab === undefined || params.tab === null || String(params.tab).trim() === ""
			? "全部"
			: String(params.tab).trim();

	// ---------- human-like helpers ----------
	const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
	const jitter = (base, variance) => base + Math.floor(Math.random() * variance);

	const humanMove = async () => {
		try {
			const size = page.viewportSize() || { width: 1280, height: 720 };
			const x = Math.floor(size.width * 0.2 + Math.random() * size.width * 0.6);
			const y = Math.floor(size.height * 0.2 + Math.random() * size.height * 0.6);
			await page.mouse.move(x, y, { steps: 3 + Math.floor(Math.random() * 3) });
		} catch {
			// ignore mouse-move errors
		}
	};

	// ---------- extraction helpers (self-contained, run in page) ----------
	const readVideos = () =>
		page.evaluate(() => {
			const data = window.ytInitialData;
			if (!data) return [];
			const contents =
				data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.richGridRenderer
					?.contents;
			if (!contents?.length) return [];
			const results = [];
			for (const item of contents) {
				const renderer = item?.richItemRenderer?.content;
				if (!renderer) continue;

				const lvm = renderer.lockupViewModel;
				if (lvm?.contentId) {
					const metadataRows =
						lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows;
					const row0Parts = metadataRows?.[0]?.metadataParts;
					const row1Parts = metadataRows?.[1]?.metadataParts;
					let duration = "";
					const overlays = lvm.contentImage?.thumbnailViewModel?.overlays;
					if (overlays) {
						for (const overlay of overlays) {
							const badges = overlay?.thumbnailBottomOverlayViewModel?.badges;
							if (badges) {
								for (const badge of badges) {
									if (badge?.thumbnailBadgeViewModel?.text) {
										duration = badge.thumbnailBadgeViewModel.text;
										break;
									}
								}
							}
							if (duration) break;
						}
					}
					results.push({
						videoId: lvm.contentId,
						title: lvm.metadata?.lockupMetadataViewModel?.title?.content || "",
						channel: row0Parts?.[0]?.text?.content || "",
						channelUrl:
							row0Parts?.[0]?.text?.commandRuns?.[0]?.onTap?.innertubeCommand?.browseEndpoint
								?.canonicalBaseUrl || "",
						views: row1Parts?.[0]?.text?.content || "",
						publishedTime: row1Parts?.[1]?.text?.content || "",
						duration,
					});
					continue;
				}

				const vr = renderer.videoRenderer;
				if (vr?.videoId) {
					results.push({
						videoId: vr.videoId,
						title: vr.title?.runs?.[0]?.text || "",
						channel: vr.ownerText?.runs?.[0]?.text || "",
						channelUrl:
							vr.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || "",
						views: vr.viewCountText?.simpleText || "",
						publishedTime: vr.publishedTimeText?.simpleText || "",
						duration: vr.lengthText?.simpleText || "",
					});
				}
			}
			return results;
		});

	const readVideoCount = () =>
		page.evaluate(() => {
			const contents =
				window.ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
					?.richGridRenderer?.contents;
			if (!contents?.length) return 0;
			let n = 0;
			for (const item of contents) {
				const r = item?.richItemRenderer?.content;
				if (r?.lockupViewModel?.contentId || r?.videoRenderer?.videoId) n++;
			}
			return n;
		});

	const readFirstVideoId = () =>
		page.evaluate(() => {
			const contents =
				window.ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
					?.richGridRenderer?.contents;
			if (!contents?.length) return null;
			for (const item of contents) {
				const r = item?.richItemRenderer?.content;
				if (r?.lockupViewModel?.contentId) return "lockup:" + r.lockupViewModel.contentId;
				if (r?.videoRenderer?.videoId) return "video:" + r.videoRenderer.videoId;
			}
			return null;
		});

	const readVideosFromDom = () =>
		page.evaluate(() => {
			const items = document.querySelectorAll("ytd-rich-item-renderer");
			const results = [];
			for (const item of items) {
				if (item.querySelector("ytd-display-ad-renderer, ytd-ad-slot-renderer")) continue;
				const lockup = item.querySelector("yt-lockup-view-model");
				const metadata = lockup?.querySelector("yt-lockup-metadata-view-model");
				const titleEl = metadata?.querySelector("#video-title, h3 a");
				const channelEl = metadata?.querySelector('a[href^="/@"]');
				const href = item.querySelector('a[href*="/watch?v="]')?.getAttribute("href") || "";
				const m = href.match(/[?&]v=([^&]+)/);
				const videoId = m ? m[1] : "";
				const metaTexts = metadata
					? Array.from(metadata.querySelectorAll("span"))
							.map((s) => s.textContent?.trim())
							.filter(Boolean)
					: [];
				let views = "";
				let publishedTime = "";
				for (const t of metaTexts) {
					if (/(次观看|view|views|万|亿)/.test(t)) {
						if (!views) views = t;
					} else if (/(前|ago|小时|天|周|月|年|分钟|刚刚)/.test(t)) {
						if (!publishedTime) publishedTime = t;
					}
				}
				const duration = lockup?.querySelector("yt-thumbnail-badge-view-model")?.textContent?.trim() || "";
				const title = titleEl?.textContent?.trim() || titleEl?.getAttribute("title") || "";
				if (!videoId && !title) continue;
				results.push({
					videoId,
					title,
					channel: channelEl?.textContent?.trim() || "",
					channelUrl: channelEl?.getAttribute("href") || "",
					views,
					publishedTime,
					duration,
				});
			}
			return results;
		});

	const CHIP_SELECTOR =
		"#chips-wrapper yt-chip-cloud-chip-renderer button[role=tab], #chips yt-chip-cloud-chip-renderer button[role=tab]";

	const readLiveChips = () =>
		page.evaluate((sel) => {
			const texts = [];
			for (const b of document.querySelectorAll(sel)) {
				const t = b.textContent?.trim();
				if (t) texts.push(t);
			}
			return Array.from(new Set(texts));
		}, CHIP_SELECTOR);

	// ---------- navigation ----------
	await page.goto("https://www.youtube.com/", {
		waitUntil: "domcontentloaded",
		timeout: 30000,
	});
	await sleep(jitter(200, 400));
	await humanMove();

	// ---------- tab matching + click (only for non-default tabs) ----------
	if (tab !== "全部") {
		// The chip bar renders asynchronously after domcontentloaded — wait for it.
		try {
			await page.waitForFunction(
				() =>
					!!document.querySelector(
						"#chips-wrapper yt-chip-cloud-chip-renderer button[role=tab], #chips yt-chip-cloud-chip-renderer button[role=tab]"
					),
				{ timeout: 15000 }
			);
		} catch {
			// fall through; readLiveChips below reports the actual state
		}
		const chips = await readLiveChips();
		if (!chips.length) {
			const pageState = await page.evaluate(() => ({
				url: location.href,
				hasChipsWrapper: !!document.querySelector("#chips-wrapper"),
				hasChips: !!document.querySelector("#chips"),
				anyChip: !!document.querySelector("yt-chip-cloud-chip-renderer"),
				readyState: document.readyState,
			}));
			fail(
				"DRIFT_DETECTED",
				`chip bar not found on the homepage (state=${JSON.stringify(pageState)})`
			);
		}
		const exact = chips.find((c) => c === tab);
		const ci = exact || chips.find((c) => c.toLowerCase() === tab.toLowerCase());
		if (!ci) {
			fail("TAB_NOT_FOUND", `tab "${tab}" not found. Available chips: ${chips.join(" | ")}`);
		}
		const clicked = await page.evaluate(
			({ sel, chipText }) => {
				const buttons = document.querySelectorAll(sel);
				for (const b of buttons) {
					if (b.textContent?.trim() === chipText) {
						b.scrollIntoView({ block: "nearest" });
						b.click();
						return true;
					}
				}
				return false;
			},
			{ sel: CHIP_SELECTOR, chipText: ci }
		);
		if (!clicked) fail("DRIFT_DETECTED", `chip "${ci}" found in list but not clickable in DOM`);
		// confirm selection flipped
		const t0 = Date.now();
		let selected = false;
		while (Date.now() - t0 < 5000) {
			const sel = await page.evaluate(
				({ sel, text }) => {
					for (const b of document.querySelectorAll(sel)) {
						if (b.textContent?.trim() === text) return b.getAttribute("aria-selected");
					}
					return null;
				},
				{ sel: CHIP_SELECTOR, text: ci }
			);
			if (sel === "true") {
				selected = true;
				break;
			}
			await sleep(150);
		}
		if (!selected) fail("DRIFT_DETECTED", `clicked chip "${ci}" but it did not become selected`);
		// wait for content to switch (best-effort: already-on-tab re-clicks do not change content)
		await sleep(jitter(400, 300));
		const beforeId = await readFirstVideoId();
		const tc = Date.now();
		while (Date.now() - tc < 4000) {
			const id = await readFirstVideoId();
			if (id && id !== beforeId) break;
			await sleep(150);
		}
		await sleep(jitter(300, 300));
	}

	// ---------- wait for embedded data ----------
	try {
		await page.waitForFunction(
			() => typeof window.ytInitialData === "object" && window.ytInitialData !== null,
			{ timeout: 15000 }
		);
	} catch {
		// will rely on DOM fallback below
	}

	// ---------- extract ----------
	let videos = await readVideos();
	if (!videos.length) {
		await humanMove();
		videos = await readVideosFromDom();
	}
	if (!videos.length) {
		fail("EMPTY_RESULT", "no video content found on the YouTube homepage");
	}

	// ---------- scroll to limit (only when primary path filled; DOM fallback path returns what's visible) ----------
	let partial = false;
	if (videos.length < limit) {
		const hadInitialData = await page.evaluate(
			() => !!window.ytInitialData?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content
				?.richGridRenderer?.contents
		);
		if (hadInitialData) {
			partial = await (async () => {
				for (let round = 0; round < 60; round++) {
					const count = await readVideoCount();
					if (count >= limit) return false;
					const hasCont = await page.evaluate(
						() => !!document.querySelector("ytd-continuation-item-renderer")
					);
					if (!hasCont) return true;
					await page.evaluate(() => {
						const cont = document.querySelector("ytd-continuation-item-renderer");
						if (cont) cont.scrollIntoView({ block: "center" });
					});
					await humanMove();
					const countBefore = count;
					const tStart = Date.now();
					let grew = false;
					while (Date.now() - tStart < 6000) {
						await sleep(jitter(250, 250));
						const cur = await readVideoCount();
						if (cur > countBefore) {
							grew = true;
							break;
						}
					}
					if (!grew) return true;
					await sleep(jitter(300, 300));
				}
				return true;
			})();
			videos = await readVideos();
		} else {
			// degraded DOM-only path: no scrolling support; whatever is visible is all we have
			partial = videos.length < limit;
		}
	}

	// ---------- shape output ----------
	const items = videos.slice(0, limit).map((v, i) => ({
		rank: i + 1,
		videoId: v.videoId,
		title: v.title || "",
		channel: v.channel || "",
		channelUrl: v.channelUrl || "",
		views: v.views || "",
		publishedTime: v.publishedTime || "",
		duration: v.duration || "",
		videoUrl: v.videoId ? `https://www.youtube.com/watch?v=${v.videoId}` : "",
	}));

	await sleep(jitter(0, 2000));

	return { items, count: items.length, partial };
};
