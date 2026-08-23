const pause = (min, max) => min + Math.floor(Math.random() * (max - min + 1));

const commandError = (code, message) => {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	return error;
};

export default async (page, params, cwd) => {
	const slug = params.slug?.trim();
	if (!slug) throw commandError("MISSING_PARAM", "slug is required");
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(slug)) {
		throw commandError("INVALID_PARAM", "slug must be a Product Hunt product slug");
	}

	const filter = params.filter;
	if (!["all", "founder", "informative"].includes(filter)) {
		throw commandError("INVALID_PARAM", "filter must be all, founder, or informative");
	}
	if (params.detailed !== "true" && params.detailed !== "false") {
		throw commandError("INVALID_PARAM", "detailed must be true or false");
	}
	const detailed = params.detailed === "true";
	const sourceUrl = `https://www.producthunt.com/products/${slug}/reviews${filter === "all" ? "" : `?filter=${filter}`}`;

	const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded" });
	if (response && response.status() === 404) {
		throw commandError("NOT_FOUND", `Product Hunt product was not found: ${slug}`);
	}

	try {
		await page.waitForSelector('[data-test="product-navigation-item-reviews"]', { timeout: 30000 });
	} catch {
		const body = await page.evaluate(() => document.body?.innerText || "");
		if (/page not found|not found|404/i.test(body)) {
			throw commandError("NOT_FOUND", `Product Hunt product was not found: ${slug}`);
		}
		throw commandError("DRIFT_DETECTED", "Product Reviews navigation was not found");
	}

	await page.waitForTimeout(pause(220, 480));
	try {
		await page.mouse.move(320, 220);
	} catch {
		// Mouse movement is courteous but not required for extraction.
	}

	const extracted = await page.evaluate((wantDetailed) => {
		const clean = (value) => String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
		const allData = Array.from(document.querySelectorAll("[data-test]"));
		const reviewActions = allData.filter((element) => {
			const value = element.getAttribute("data-test") || "";
			return value.startsWith("detailed-review-") && value.endsWith("-actionbar");
		});
		const tagSection = (lines, startMarker, endMarkers) => {
			const start = lines.indexOf(startMarker);
			if (start < 0) return [];
			const end = lines.findIndex((line, index) => index > start && endMarkers.includes(line));
			return lines.slice(start + 1, end < 0 ? lines.length : end).filter((line) => /\(\d+\)$/.test(line));
		};
		const parseTags = (lines) => lines.map((line) => {
			const match = line.match(/^(.*?) \((\d+)\)$/);
			return match ? { label: match[1], count: Number(match[2]) } : { label: line };
		});
		const parseReview = (action) => {
			const id = (action.getAttribute("data-test") || "").replace(/-actionbar$/, "");
			const card = action.parentElement?.parentElement || action.parentElement || action;
			const lines = clean(card.innerText);
			const reviewCountIndex = lines.findIndex((line) => /^\d[\d,]* reviews?$/.test(line));
			const bodyStart = reviewCountIndex >= 0 ? reviewCountIndex + 1 : 0;
			const actionIndex = lines.findIndex((line, index) => index >= bodyStart && line === "Helpful");
			const bodyLines = lines.slice(bodyStart, actionIndex < 0 ? lines.length : actionIndex);
			const sectionLabels = new Set([
				"What's great",
				"What needs improvement",
				"Alternatives Considered",
				"vs Alternatives",
				"Ratings",
				"Ease of use",
				"Reliability",
				"Value for money",
				"Customization"
			]);
			const body = bodyLines
				.filter((line) => line !== "Read more" && !sectionLabels.has(line) && !/\(\d+\)$/.test(line))
				.join("\n");
			const usedIndex = lines.indexOf("used");
			const buildIndex = lines.indexOf("to build");
			const actionText = clean(action.innerText).join("\n");
			const helpfulMatch = actionText.match(/\((\d+)\)/);
			const viewsMatch = actionText.match(/(\d[\d,]*) views/);
			const age = clean(action.innerText).find((line) => /^\d+(?:h|d|mo|yr) ago$/i.test(line)) || null;
			const review = {
				id,
				author: lines[0] || null,
				context: usedIndex >= 0 ? {
					verb: "used",
					product: lines[usedIndex + 1] || null,
					action: lines[usedIndex + 2] || null,
					target: lines[buildIndex + 1] || null
				} : null,
				reviewerReviewCount: reviewCountIndex >= 0 ? Number(lines[reviewCountIndex].replace(/[^0-9]/g, "")) : null,
				text: body,
				helpfulCount: helpfulMatch ? Number(helpfulMatch[1]) : 0,
				views: viewsMatch ? Number(viewsMatch[1].replace(/,/g, "")) : null,
				age
			};
			if (wantDetailed) {
				review.pros = parseTags(tagSection(lines, "What's great", ["What needs improvement", "Alternatives Considered", "Helpful"]));
				review.cons = parseTags(tagSection(lines, "What needs improvement", ["Alternatives Considered", "Helpful"]));
				review.rawText = (card.innerText || "").trim();
			}
			return review;
		};
		const parseComment = (element) => {
			const rawText = (element.innerText || "").trim();
			const lines = clean(rawText);
			const actionIndex = lines.findIndex((line) => line === "Upvote");
			const content = actionIndex >= 0 ? lines.slice(0, actionIndex) : lines;
			const age = lines.find((line) => /^\d+(?:h|d|mo|yr) ago$/i.test(line)) || null;
			const upvoteMatch = rawText.match(/\((\d+)\)/);
			return {
				id: element.getAttribute("data-test"),
				author: content[0] || null,
				text: content.slice(1).join("\n"),
				upvotes: upvoteMatch ? Number(upvoteMatch[1]) : 0,
				age,
				rawText
			};
		};
		const header = document.querySelector('[data-test="header"]')?.innerText || "";
		const headerLines = clean(header);
		const reviewCountMatch = header.match(/([\d,]+) reviews/);
		const ratingMatch = header.match(/(?:^|\n)(\d(?:\.\d)?)\n/);
		const reviews = reviewActions.map(parseReview);
		const commentNodes = allData.filter((element) => {
			const value = element.getAttribute("data-test") || "";
			return value.startsWith("comment-") && value !== "comment-form" && value !== "comment-form-editor" && value !== "comment-menu-button";
		});
		const threadNodes = allData.filter((element) => (element.getAttribute("data-test") || "").startsWith("thread-"));
		return {
			product: {
				name: headerLines[0] || null,
				rating: ratingMatch ? Number(ratingMatch[1]) : null,
				reviewCount: reviewCountMatch ? Number(reviewCountMatch[1].replace(/,/g, "")) : null
			},
			reviews,
			comments: wantDetailed ? commentNodes.map(parseComment) : [],
			threads: wantDetailed ? threadNodes.map((element) => ({ id: element.getAttribute("data-test"), rawText: (element.innerText || "").trim() })) : [],
			paginationObserved: /First\s+Previous/.test(document.body.innerText || "")
		};
	}, detailed);

	if (!extracted.reviews.length) {
		throw commandError("EMPTY_RESULT", `No reviews were rendered for ${slug} with filter ${filter}`);
	}

	await page.waitForTimeout(pause(0, 2000));
	return {
		sourceUrl: page.url(),
		filter,
		product: extracted.product,
		reviews: extracted.reviews,
		count: extracted.reviews.length,
		pagination: {
			supported: false,
			observed: extracted.paginationObserved,
			note: "Founder Reviews showed numbered controls, but no page parameter is exposed by this command contract."
		},
		...(detailed ? { comments: extracted.comments, threads: extracted.threads } : {})
	};
};
