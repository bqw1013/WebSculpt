const MAX_LIMIT = 100;
const randomBetween = (min, max) => Math.floor(min + Math.random() * (max - min + 1));

const randomWait = (page, min, max) => page.waitForTimeout(randomBetween(min, max));

// Keep the browser path human-paced without adding long fixed sleeps.
const lightHumanize = async (page, scroll = false) => {
	try {
		const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
		if (page.mouse && typeof page.mouse.move === "function" && viewport.width > 0 && viewport.height > 0) {
			await page.mouse.move(
				Math.floor(viewport.width * (0.35 + Math.random() * 0.3)),
				Math.floor(viewport.height * (0.2 + Math.random() * 0.35)),
				{ steps: 2 + randomBetween(0, 2) }
			);
		}
		if (scroll && page.mouse && typeof page.mouse.wheel === "function") {
			await page.mouse.wheel(0, randomBetween(80, 180));
		}
	} catch {
		// Pointer/scroll nudges are best effort; extraction must remain usable.
	}
};

export default async (page, params, cwd) => {
	const query = typeof params.query === "string" ? params.query.trim() : "";
	if (!query) {
		const error = new Error("[MISSING_PARAM] query is required");
		error.code = "MISSING_PARAM";
		throw error;
	}

	const type = params.type;
	const types = new Set(["top", "recent", "posts", "publications", "people"]);
	if (!types.has(type)) {
		const error = new Error("[INVALID_PARAM] type must be one of top, recent, posts, publications, people");
		error.code = "INVALID_PARAM";
		throw error;
	}

	const rawLimit = params.limit === undefined || params.limit === null ? "" : String(params.limit).trim();
	if (!/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || !Number.isSafeInteger(Number(rawLimit))) {
		const error = new Error("[INVALID_PARAM] limit must be a positive integer");
		error.code = "INVALID_PARAM";
		throw error;
	}
	const limit = Number(rawLimit);
	if (limit > MAX_LIMIT) {
		const error = new Error(`[LIMIT_EXCEEDED] limit cannot exceed ${MAX_LIMIT}`);
		error.code = "LIMIT_EXCEEDED";
		throw error;
	}

	const ignoredParams = [];
	if (params.sort !== undefined && params.sort !== "" && params.sort !== "default") {
		ignoredParams.push(`sort=${params.sort}`);
	}
	if (params.time !== undefined && params.time !== "" && params.time !== "all") {
		ignoredParams.push(`time=${params.time}`);
	}

	try {
		await page.goto("https://substack.com/explore", { waitUntil: "domcontentloaded", timeout: 30000 });
		await randomWait(page, 300, 650);
		await lightHumanize(page);
	} catch {
		// The API attempt below will fail and trigger the DOM/error path with a useful code.
	}

	const apiKey = type === "recent" || type === "top" ? "items" : "results";
	const encode = (value) => encodeURIComponent(value);
	const makeApiUrl = (pageNumber, cursor) => {
		const encodedQuery = encode(query);
		if (type === "top") {
			const cursorPart = cursor ? `&cursor=${encode(cursor)}` : "";
			return `/api/v1/top/search?query=${encodedQuery}&fromSuggestedSearch=false${cursorPart}`;
		}
		if (type === "recent") {
			const cursorPart = cursor ? `&cursor=${encode(cursor)}` : "";
			return `/api/v1/recent/search?query=${encodedQuery}&fromSuggestedSearch=false${cursorPart}`;
		}
		if (type === "posts") {
			return `/api/v1/post/search?query=${encodedQuery}&page=${pageNumber}&includePlatformResults=true&filter=all`;
		}
		if (type === "publications") {
			return `/api/v1/publication/search?query=${encodedQuery}&page=${pageNumber}&lastSearch=${Date.now()}`;
		}
		return `/api/v1/profile/search?query=${encodedQuery}&page=${pageNumber}`;
	};

	const readJson = async (url) => {
		const response = await page.evaluate(async (target) => {
			const result = await fetch(target, { credentials: "include" });
			return { status: result.status, body: await result.text() };
		}, url);
		if (response.status < 200 || response.status >= 300) {
			throw new Error(`HTTP ${response.status}`);
		}
		let body;
		try {
			body = JSON.parse(response.body);
		} catch {
			throw new Error("invalid JSON response");
		}
		if (!body || !Array.isArray(body[apiKey])) {
			throw new Error(`missing ${apiKey} array`);
		}
		return body;
	};

	const commandError = (code, message) => {
		const error = new Error(`[${code}] ${message}`);
		error.code = code;
		return error;
	};

	let apiFailure = null;
	try {
		let pageNumber = 0;
		let cursor = null;
		let firstBody = null;
		let lastBody = null;
		const collected = [];
		for (let attempt = 0; attempt < 6 && collected.length < limit; attempt += 1) {
			if (attempt > 0) await randomWait(page, 220, 520);
			const body = await readJson(makeApiUrl(pageNumber, cursor));
			if (!firstBody) firstBody = body;
			lastBody = body;
			collected.push(...body[apiKey]);
			if (body[apiKey].length === 0) break;
			if (type === "top") {
				if (!body.nextCursor || body.nextCursor === cursor) break;
				cursor = body.nextCursor;
				continue;
			}
			if (type === "recent") {
				if (!body.nextCursor) break;
				cursor = body.nextCursor;
			} else {
				if (body.more !== true) break;
				pageNumber += 1;
			}
		}
		if (!firstBody || !lastBody) throw new Error("empty API response");
		const output = {
			...firstBody,
			...lastBody,
			[apiKey]: collected.slice(0, limit),
			source: "api",
			fallbackUsed: false,
			maxLimit: MAX_LIMIT
		};
		if (ignoredParams.length > 0) output.ignoredParams = ignoredParams;
		await randomWait(page, 0, 450);
		return output;
	} catch (error) {
		apiFailure = error instanceof Error ? error.message : String(error);
	}

	const searchingValue = {
		top: "top",
		recent: "recent",
		posts: "posts",
		publications: "publication",
		people: "profile"
	}[type];
	const searchUrl = `https://substack.com/search/${encode(query)}?searching=${searchingValue}`;
	const fallbackSelector = {
		top: 'main a[href*="/p/"], main [class*="profileRow-"]',
		recent: 'main [class*="feedUnit-"], main article',
		posts: 'main a[href*="/p/"]',
		publications: 'main [class*="profileRow-"]',
		people: 'main [class*="profileRow-"]'
	}[type];
	try {
		await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
		await page.waitForSelector(fallbackSelector, { timeout: 6000 }).catch(() => {});
		await randomWait(page, 350, 750);
		await lightHumanize(page, true);
		const records = await page.evaluate(({ resultType, resultLimit }) => {
			const main = document.querySelector("main") || document.body;
			const records = [];
			const seen = new Set();
			const linesOf = (value) => (value || "").split(/\r?\n+/).map((line) => line.trim()).filter(Boolean);
			const add = (record, key) => {
				if (!record || !record[key] || seen.has(record[key])) return;
				seen.add(record[key]);
				records.push(record);
			};

			if (resultType === "posts" || resultType === "top") {
				for (const anchor of main.querySelectorAll("a[href]")) {
					if (!anchor.href.includes("/p/")) continue;
					const lines = linesOf(anchor.innerText);
					add({ url: anchor.href, source: lines[0] || null, title: lines.at(-1) || null, text: (anchor.innerText || "").trim() }, "url");
					if (records.length >= resultLimit && resultType === "posts") break;
				}
			}

			if (resultType === "people" || resultType === "publications" || resultType === "top") {
				for (const card of main.querySelectorAll('[class*="profileRow-"]')) {
					const cardLines = linesOf(card.innerText);
					const handleLine = cardLines.find((line) => line.startsWith("@"));
					const handle = handleLine ? handleLine.split(/\s|[•·]/)[0].replace(/^@/, "") : null;
					if (!handle || !cardLines[0]) continue;
					add({ url: `https://substack.com/@${handle}`, name: cardLines[0], handle, description: cardLines.slice(1).join(" "), text: cardLines.join("\n") }, "url");
					if (records.length >= resultLimit && resultType !== "top") break;
				}
			}

			if (resultType === "recent") {
				for (const unit of main.querySelectorAll('[class*="feedUnit-"], article')) {
					const text = (unit.innerText || "").trim();
					if (!text) continue;
					const link = unit.querySelector("a[href]");
					add({ url: link ? link.href : null, text }, "text");
					if (records.length >= resultLimit) break;
				}
			}
			return records.slice(0, resultLimit);
		}, { resultType: type, resultLimit: limit });

		if (!Array.isArray(records) || records.length === 0) {
			throw commandError("DRIFT_DETECTED", "Substack search page rendered no extractable results");
		}
		const resultKey = type === "recent" || type === "top" ? "items" : "results";
		const output = {
			query,
			type,
			[resultKey]: records,
			source: "dom",
			fallbackUsed: true,
			partial: true,
			fallbackReason: apiFailure,
			maxLimit: MAX_LIMIT
		};
		if (ignoredParams.length > 0) output.ignoredParams = ignoredParams;
		await randomWait(page, 0, 450);
		return output;
	} catch (error) {
		if (error && error.code === "DRIFT_DETECTED") throw error;
		throw commandError("DRIFT_DETECTED", `Substack API and DOM extraction failed: ${apiFailure || "unknown API error"}`);
	}
};
