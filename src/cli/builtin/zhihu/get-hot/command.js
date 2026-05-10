function makeError(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	return error;
}

export default async function (page, params) {
	const limit = parseInt(params.limit, 10);

	if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
		throw makeError("INVALID_LIMIT", "limit must be an integer from 1 to 50");
	}

	await page.goto("https://www.zhihu.com/hot", {
		waitUntil: "domcontentloaded",
		timeout: 30000
	});

	try {
		await page.waitForSelector("main h2", { timeout: 15000 });
	} catch {
		throw makeError("DRIFT_DETECTED", "Zhihu hot list headings were not found in the rendered page");
	}

	const items = await page.evaluate((maxItems) => {
		return Array.from(document.querySelectorAll("main h2"))
			.slice(0, maxItems)
			.map((heading, index) => {
				const link = heading.closest("a");
				const containerText = link?.parentElement?.innerText || "";
				const heatMatch = containerText.match(/[0-9.]+\s*万热度/);

				return {
					rank: index + 1,
					title: heading.innerText.trim(),
					url: link?.href || "",
					hot: heatMatch?.[0] || ""
				};
			})
			.filter((item) => item.title && item.url);
	}, limit);

	if (items.length === 0) {
		throw makeError("EMPTY_RESULT", "No Zhihu hot list items were extracted");
	}

	const missingHeatCount = items.filter((item) => !item.hot).length;
	if (missingHeatCount === items.length) {
		throw makeError("DRIFT_DETECTED", "Zhihu hot list items were found but heat values were not extracted");
	}

	return {
		source: "https://www.zhihu.com/hot",
		count: items.length,
		items
	};
}
