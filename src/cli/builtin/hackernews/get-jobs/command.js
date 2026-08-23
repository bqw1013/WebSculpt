const BASE_URL = "https://news.ycombinator.com";
const JOBS_URL = `${BASE_URL}/jobs`;
const FIREBASE_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item";
const MAX_LIMIT = 50;

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function parseLimit(raw) {
	if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
		fail("INVALID_PARAM", "limit must be an integer from 1 through 50");
	}
	const limit = Number(raw);
	if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
		fail("INVALID_PARAM", "limit must be an integer from 1 through 50");
	}
	return limit;
}

async function fetchJson(url) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 15000);
	let response;
	try {
		response = await fetch(url, {
			signal: controller.signal,
			headers: { accept: "application/json" },
		});
	} catch (error) {
		if (error?.name === "AbortError") {
			fail("NETWORK_ERROR", `Timed out while requesting ${url}`);
		}
		fail("NETWORK_ERROR", `Could not request ${url}`);
	} finally {
		clearTimeout(timeout);
	}

	if (response.status === 429) {
		fail("RATE_LIMITED", `Firebase returned HTTP 429 for ${url}`);
	}
	if (!response.ok) {
		fail("API_ERROR", `Firebase returned HTTP ${response.status} for ${url}`);
	}

	try {
		return await response.json();
	} catch {
		fail("DRIFT_DETECTED", `Firebase response was not valid JSON for ${url}`);
	}
}

async function readJobsPage(page, url) {
	let response;
	try {
		response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
	} catch (error) {
		if (error?.code === "DRIFT_DETECTED" || error?.code === "NETWORK_ERROR") throw error;
		fail("NETWORK_ERROR", `Could not load ${url}`);
	}

	if (response) {
		const status = response.status();
		if (status === 429) fail("RATE_LIMITED", `Hacker News returned HTTP 429 for ${url}`);
		if (status < 200 || status >= 300) fail("API_ERROR", `Hacker News returned HTTP ${status} for ${url}`);
	}

	let data;
	try {
		await page.waitForSelector("html[op='jobs']", { state: "attached", timeout: 12000 });
		data = await page.evaluate(() => {
			const root = document.documentElement;
			const rows = [...document.querySelectorAll("tr.athing.submission")].map((row) => {
				const titleLink = row.querySelector(".titleline > a");
				const age = row.nextElementSibling?.querySelector(".age");
				const itemLink = age?.querySelector("a[href*='item?id=']");
				const href = titleLink?.getAttribute("href") || null;
				const itemHref = itemLink?.getAttribute("href") || null;
				return {
					id: Number.parseInt(row.id, 10),
					rank: Number.parseInt(row.querySelector(".rank")?.textContent || "", 10),
					title: titleLink?.textContent?.trim() || null,
					pageHref: href ? new URL(href, location.href).href : null,
					hnUrl: itemHref ? new URL(itemHref, location.href).href : null,
					ageTitle: age?.getAttribute("title") || null,
				};
			});
			const more = document.querySelector("a.morelink");
			return {
				op: root?.getAttribute("op") || null,
				rows,
				moreHref: more?.href || null,
			};
		});
	} catch (error) {
		if (error?.code) throw error;
		fail("DRIFT_DETECTED", "Could not inspect the Hacker News jobs page structure");
	}

	if (data.op !== "jobs") {
		fail("DRIFT_DETECTED", "Expected the Hacker News jobs page marker");
	}
	if (!Array.isArray(data.rows)) {
		fail("DRIFT_DETECTED", "Expected Hacker News jobs rows to be an array");
	}
	if (data.rows.length === 0) {
		fail("EMPTY_RESULT", "No Hacker News jobs were available");
	}
	return data;
}

async function enrichRow(row) {
	if (!Number.isSafeInteger(row.id) || !Number.isSafeInteger(row.rank) || !row.title) {
		fail("DRIFT_DETECTED", "A Hacker News jobs row is missing its id, rank, or title");
	}
	const item = await fetchJson(`${FIREBASE_ITEM_URL}/${row.id}.json`);
	if (!item || item.deleted || item.dead) return null;
	if (item.type !== "job" || item.id !== row.id || typeof item.by !== "string" || typeof item.time !== "number" || typeof item.title !== "string") {
		fail("DRIFT_DETECTED", `Firebase item ${row.id} was not a valid job record`);
	}
	const pageIsInternal = row.pageHref?.includes("news.ycombinator.com/item?id=");
	const url = typeof item.url === "string" && item.url ? item.url : pageIsInternal ? null : row.pageHref;
	return {
		rank: row.rank,
		storyId: row.id,
		title: item.title,
		url: url || null,
		hnUrl: row.hnUrl || `${BASE_URL}/item?id=${row.id}`,
		author: item.by,
		createdAt: new Date(item.time * 1000).toISOString(),
		points: Number.isFinite(item.score) ? item.score : 0,
		text: typeof item.text === "string" ? item.text : null,
	};
}

async function enrichRows(rows) {
	const results = new Array(rows.length);
	let cursor = 0;
	const worker = async () => {
		while (cursor < rows.length) {
			const index = cursor++;
			results[index] = await enrichRow(rows[index]);
		}
	};
	const workers = Math.min(6, rows.length);
	await Promise.all(Array.from({ length: workers }, worker));
	return results.filter(Boolean);
}

export default async (page, params, cwd) => {
	const limit = parseLimit(params.limit);
	const items = [];
	const seenIds = new Set();
	let nextUrl = JOBS_URL;
	let lastRank = 0;

	while (nextUrl && items.length < limit) {
		const data = await readJobsPage(page, nextUrl);
		for (const row of data.rows) {
			if (row.rank <= lastRank || seenIds.has(row.id)) {
				fail("DRIFT_DETECTED", "Hacker News jobs pagination returned a duplicate or out-of-order row");
			}
			lastRank = row.rank;
			seenIds.add(row.id);
		}
		const enriched = await enrichRows(data.rows);
		for (const item of enriched) {
			if (items.length >= limit) break;
			items.push(item);
		}
		if (items.length >= limit) break;
		if (!data.moreHref) break;
		if (!data.moreHref.startsWith(`${BASE_URL}/jobs`)) {
			fail("DRIFT_DETECTED", "Hacker News jobs More link pointed outside the jobs feed");
		}
		nextUrl = data.moreHref;
	}

	if (items.length === 0) fail("EMPTY_RESULT", "No eligible Hacker News jobs were available");
	return items;
};
