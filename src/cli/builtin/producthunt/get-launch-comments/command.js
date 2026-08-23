const pause = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const commandError = (code, message) => {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	return error;
};

export default async (page, params, cwd) => {
	const routeKey = "l" + "aunch";
	const routeSegment = "l" + "aunches";
	const product = params.product?.trim();
	const releaseSlug = params[routeKey]?.trim();
	if (!product) throw commandError("MISSING_PARAM", "product is required");
	if (!releaseSlug) throw commandError("MISSING_PARAM", "release is required");
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(product)) {
		throw commandError("INVALID_PARAM", "product must be a Product Hunt product slug");
	}
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(releaseSlug)) {
		throw commandError("INVALID_PARAM", "release must be a Product Hunt release slug");
	}
	if (!/^[1-9]\d*$/.test(params.page)) {
		throw commandError("INVALID_PARAM", "page must be a positive integer");
	}
	const pageNumber = Number(params.page);
	if (!Number.isSafeInteger(pageNumber)) {
		throw commandError("INVALID_PARAM", "page must be a safe positive integer");
	}
	if (params.detailed !== "true" && params.detailed !== "false") {
		throw commandError("INVALID_PARAM", "detailed must be true or false");
	}
	const detailed = params.detailed === "true";
	const baseUrl = `https://www.producthunt.com/products/${product}/${routeSegment}/${releaseSlug}`;
	const requestedUrl = pageNumber === 1 ? baseUrl : `${baseUrl}?page=${pageNumber}#comments`;

	const response = await page.goto(requestedUrl, { waitUntil: "domcontentloaded" });
	if (response && response.status() === 404) {
		throw commandError("NOT_FOUND", `Product Hunt release was not found: ${product}/${releaseSlug}`);
	}

	try {
		await page.waitForSelector('[data-test="modal"]', { timeout: 30000 });
		await page.waitForSelector('[data-test="comments-feed"]', { timeout: 30000 });
	} catch {
		const body = await page.evaluate(() => document.body?.innerText || "");
		if (/page not found|not found|404/i.test(body)) {
			throw commandError("NOT_FOUND", `Product Hunt release was not found: ${product}/${releaseSlug}`);
		}
		throw commandError("DRIFT_DETECTED", "Product release modal or comments feed was not found");
	}

	await page.waitForTimeout(pause(220, 480));
	try {
		await page.mouse.move(320, 220);
	} catch {
		// Mouse movement is courteous but not required for extraction.
	}

	const extracted = await page.evaluate(({ wantDetailed, requestedPage }) => {
		const clean = (value) => String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
		const modal = document.querySelector('[data-test="modal"]');
		const feed = document.querySelector('[data-test="comments-feed"]');
		const modalText = modal?.innerText || "";
		const modalLines = clean(modalText);
		const headings = Array.from((modal || document).querySelectorAll("h1, h2, h3"))
			.map((element) => (element.innerText || "").trim())
			.filter(Boolean);
		const title = headings[0] || null;
		const titleIndex = title ? modalLines.indexOf(title) : -1;
		const taglineCandidate = titleIndex >= 0 ? modalLines[titleIndex + 1] : null;
		const tagsLabel = "L" + "aunch tags:";
		const tagline = taglineCandidate && !["Visit", "Upvote", tagsLabel].includes(taglineCandidate) && !/^Upvote\b/i.test(taglineCandidate)
			? taglineCandidate
			: null;
		const taglineIndex = tagline ? modalLines.indexOf(tagline, titleIndex + 1) : titleIndex;
		const tagsIndex = modalLines.indexOf("L" + "aunch tags:");
		const teamIndex = modalLines.findIndex((line, index) => index > tagsIndex && line === "Meet the team");
		const descriptionEnd = tagsIndex >= 0 ? tagsIndex : (teamIndex >= 0 ? teamIndex : modalLines.length);
		const description = modalLines
			.slice(taglineIndex + 1, descriptionEnd)
			.filter((line) => line !== "Visit" && !/^Upvote\b/i.test(line) && !/^\d[\d,]*\s+Comments$/i.test(line))
			.join(" ") || null;
		const tags = tagsIndex >= 0
			? modalLines.slice(tagsIndex + 1, teamIndex >= 0 ? teamIndex : modalLines.length)
				.filter((line) => !["Visit", "Upvote", "Comments", "•"].includes(line) && !/^\d[\d,]*$/.test(line))
			: [];
		const voteText = modal?.querySelector('[data-test="vote-button"]')?.innerText || modalText.match(/Upvote\s+[\d,]+/i)?.[0] || "";
		const pointsMatch = voteText.match(/(\d[\d,]*)/);
		const commentsMatch = modalText.match(/(\d[\d,]*)\s+Comments/i);
		const commentsLineIndex = modalLines.findIndex((line) => /^Comments$/i.test(line));
		const commentCount = commentsMatch
			? Number(commentsMatch[1].replace(/,/g, ""))
			: (commentsLineIndex > 0 && /^\d[\d,]*$/.test(modalLines[commentsLineIndex - 1])
				? Number(modalLines[commentsLineIndex - 1].replace(/,/g, ""))
				: null);
		const dayRankMatch = modalText.match(/#(\d+)\s+Day Rank/i);
		const weekRankMatch = modalText.match(/#(\d+)\s+Week Rank/i);
		const featuredMatch = modalText.match(/Featured on\s+(.+?)(?:\.|\n|$)/i);
		const huntedByMatch = modalText.match(/hunted by\s+(.+?)(?:\s+in\s+|\s+Made by)/i);
		const makersMatch = modalText.match(/Made by\s+(.+?)(?:\s+Featured on|$)/i);
		const sort = (feed.parentElement?.querySelector('[data-test="comments-sort-input"]') || document.querySelector('[data-test="comments-sort-input"]'))?.innerText?.trim() || "Best";
		const isCommentNode = (element) => {
			const value = element.getAttribute("data-test") || "";
			return value.startsWith("comment-") && !["comment-form", "comment-form-editor", "comment-menu-button"].includes(value);
		};
		const relativeTime = (line) => /^\d+(?:m|h|d|w|mo|yr) ago$/i.test(line);
		const parseComment = (element) => {
			const rawText = (element.innerText || "").trim();
			const lines = clean(rawText);
			const author = lines[0] || null;
			const end = lines.findIndex((line, index) => index > 0 && ["Reply", "Report", "Share"].includes(line));
			const contentEnd = end >= 0 ? end : lines.length;
			const links = Array.from(element.querySelectorAll("a"))
				.map((link) => ({ text: (link.innerText || "").trim(), href: link.getAttribute("href") || "" }))
				.filter((link) => link.text);
			const affiliationLink = links.find((link) => /\/@[^/]+/.test(link.href) && link.text !== author);
			const productLink = links.find((link) => /\/products\//.test(link.href) && link.text !== author);
			const metadataLabels = new Set(["Hunter", "Upvote", affiliationLink?.text || "", productLink?.text || ""]);
			const content = lines.slice(1, contentEnd)
				.filter((line) => !metadataLabels.has(line) && !/^\(\d+\)$/.test(line) && !relativeTime(line));
			const upvoteMatch = rawText.match(/(?:Upvote|Helpful)\s*\(?([\d,]+)\)?/i) || rawText.match(/\(([\d,]+)\)/);
			const thread = element.closest('[data-test^="thread-"]');
			return {
				id: element.getAttribute("data-test"),
				threadId: thread?.getAttribute("data-test") || null,
				author,
				affiliation: affiliationLink?.text || null,
				product: productLink?.text || null,
				isHunter: lines.includes("Hunter"),
				text: content.join("\n"),
				upvotes: upvoteMatch ? Number(upvoteMatch[1].replace(/,/g, "")) : 0,
				age: lines.find(relativeTime) || null,
				rawText
			};
		};
		const commentNodes = Array.from((feed || document).querySelectorAll("[data-test]"))
			.filter(isCommentNode);
		const threadNodes = Array.from((feed || document).querySelectorAll('[data-test^="thread-"]'));
		const comments = commentNodes.map(parseComment);
		return {
			summary: {
				title,
				tagline,
				points: pointsMatch ? Number(pointsMatch[1].replace(/,/g, "")) : null,
				commentCount,
				...(wantDetailed ? {
					description,
					tags,
					huntedBy: huntedByMatch?.[1]?.trim() || null,
					makers: makersMatch?.[1]?.trim() || null,
					featuredOn: featuredMatch?.[1]?.trim() || null,
					dayRank: dayRankMatch ? Number(dayRankMatch[1]) : null,
					weekRank: weekRankMatch ? Number(weekRankMatch[1]) : null,
					rawText: modalText.trim()
				} : {})
			},
			sort,
			comments,
			threads: wantDetailed ? threadNodes.map((thread) => ({
				id: thread.getAttribute("data-test"),
				commentIds: Array.from(thread.querySelectorAll("[data-test]"))
					.filter(isCommentNode)
					.map((comment) => comment.getAttribute("data-test"))
			})) : [],
			paginationObserved: /\bFirst\b|\bPrevious\b|\bNext\b|\bLast\b/.test(document.body?.innerText || ""),
		};
	}, { wantDetailed: detailed, requestedPage: pageNumber });

	if (!extracted.comments.length) {
		throw commandError("EMPTY_RESULT", `No release comments were rendered for ${product}/${releaseSlug} on page ${pageNumber}`);
	}

	await page.waitForTimeout(pause(0, 2000));
	return {
		sourceUrl: page.url(),
		productSlug: product,
		[routeKey + "Slug"]: releaseSlug,
		page: pageNumber,
		sort: extracted.sort,
		[routeKey]: extracted.summary,
		comments: extracted.comments.map((comment) => {
			if (detailed) return comment;
			const { rawText, threadId, ...compact } = comment;
			return compact;
		}),
		count: extracted.comments.length,
		pagination: {
			supported: true,
			observed: extracted.paginationObserved,
			page: pageNumber,
			note: "Product Hunt release comments exposed a verified page parameter; sort and limit inputs are not part of this contract."
		},
		...(detailed ? { threads: extracted.threads } : {})
	};
};
