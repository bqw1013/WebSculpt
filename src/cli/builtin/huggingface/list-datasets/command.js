// Hugging Face dataset list command.
// Browser runtime: navigates to huggingface.co (same-origin anchor), then uses an
// in-page fetch to HF's internal API /api/datasets. Command-line network (node/curl)
// cannot reach huggingface.co, so all data comes from the browser's network.
//
// Polite pacing (user hard requirement): each run applies a random wait, a random mouse
// move and a random scroll before the API call, but keeps total runtime well under 10s.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// CLI-facing sort enum -> API sort token. "trending" is omitted so the API uses its
// default order, which is trendingScore (verified: ?limit=3 and ?sort=trendingScore
// both return HuggingFaceFW/fineweb first). created/modified map to createdAt/lastModified.
const SORT_TOKENS = {
	trending: null,
	likes: 'likes',
	downloads: 'downloads',
	created: 'createdAt',
	modified: 'lastModified',
};

const VALID_SORTS = Object.keys(SORT_TOKENS);

export default async (page, params, cwd) => {
	// --- Parameter validation (fail fast, before any browser/network work) ---
	// sort is trimmed before validation so "--sort \" likes \"" behaves like "likes",
	// consistent with search/author which are also trimmed.
	const sort = String(params.sort || '').toLowerCase().trim();
	if (!VALID_SORTS.includes(sort)) {
		const err = new Error(
			`[INVALID_PARAM] Invalid sort "${sort}". Valid values: ${VALID_SORTS.join(', ')}`
		);
		err.code = 'INVALID_PARAM';
		throw err;
	}

	const search = (params.search || '').trim();
	const author = (params.author || '').trim();

	// limit must be a plain decimal integer string (no "+5"/"1.5"/"1e3"/"2abc"
	// parseInt coercion). Validate the raw string first, then the 1-100 range.
	const rawLimit = String(params.limit ?? '');
	if (!/^\d+$/.test(rawLimit)) {
		const err = new Error(
			`[INVALID_PARAM] limit must be a positive integer between 1 and 100, got: "${params.limit}"`
		);
		err.code = 'INVALID_PARAM';
		throw err;
	}
	const limit = Number(rawLimit);
	if (limit < 1 || limit > 100) {
		const err = new Error('[INVALID_PARAM] limit must be an integer between 1 and 100');
		err.code = 'INVALID_PARAM';
		throw err;
	}

	// --- Build the API query (only include active filters) ---
	const query = new URLSearchParams();
	if (search) query.set('search', search);
	const apiSort = SORT_TOKENS[sort];
	if (apiSort) query.set('sort', apiSort);
	if (author) query.set('author', author);
	query.set('limit', String(limit));

	// --- Same-origin anchor page so the in-page fetch targets huggingface.co ---
	await page.goto('https://huggingface.co/datasets', { waitUntil: 'domcontentloaded' });

	// --- Polite pacing throttle: random wait + mouse move + random scroll + random wait ---
	await sleep(rand(300, 900));
	await page.mouse.move(rand(120, 800), rand(120, 600));
	await page.evaluate((px) => window.scrollBy(0, px), rand(120, 520));
	await sleep(rand(300, 700));

	// --- Fetch the dataset list via the browser's network ---
	const result = await page.evaluate(async (q) => {
		try {
			const res = await fetch('/api/datasets?' + q, { headers: { accept: 'application/json' } });
			const json = await res.json();
			return { status: res.status, json };
		} catch (err) {
			return { status: 0, message: String(err) };
		}
	}, query.toString());

	if (!result || result.status === 0) {
		const err = new Error(`[NETWORK_ERROR] Failed to fetch /api/datasets: ${result ? result.message : 'no response'}`);
		err.code = 'NETWORK_ERROR';
		throw err;
	}

	if (result.status !== 200 || !Array.isArray(result.json)) {
		const apiMessage = result.json && result.json.error ? result.json.error : `HTTP ${result.status}`;
		const err = new Error(`[NETWORK_ERROR] /api/datasets returned: ${apiMessage}`);
		err.code = 'NETWORK_ERROR';
		throw err;
	}

	const raw = result.json;
	if (raw.length === 0) {
		const err = new Error('[EMPTY_RESULT] No datasets matched the given filters');
		err.code = 'EMPTY_RESULT';
		throw err;
	}

	// --- Map to the output schema (url is built from id; API has no url field) ---
	const items = raw.map((d) => ({
		id: d.id,
		url: `https://huggingface.co/datasets/${d.id}`,
		likes: d.likes,
		downloads: d.downloads,
		trendingScore: d.trendingScore,
		tags: Array.isArray(d.tags) ? d.tags : [],
		createdAt: d.createdAt,
		lastModified: d.lastModified,
	}));

	return {
		items,
		count: items.length,
		filters: {
			search: search || null,
			sort,
			author: author || null,
		},
	};
};
