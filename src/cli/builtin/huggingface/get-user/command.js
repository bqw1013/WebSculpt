// huggingface/get-user
// Fetch a HF user or organization profile: display name, PRO flag, follower/following
// counts, avatar URL, plus the profile's published models and dataset/Space counts.
// Profile fields come from the /{user} page DOM; output data comes from HF's internal
// author-filtered list APIs via in-page fetch (reuses the browser's network).

export default async (page, params, cwd) => {
	const username = (params.user || "").trim();
	if (!username) {
		const err = new Error("[MISSING_PARAM] user parameter is required (HF username or organization name)");
		err.code = "MISSING_PARAM";
		throw err;
	}
	if (username.includes("/")) {
		const err = new Error("[INVALID_PARAM] user should be a plain HF username or organization name, not a repo id");
		err.code = "INVALID_PARAM";
		throw err;
	}

	// Navigate to the profile page. commit + waitForSelector h1 minimizes time spent
	// waiting on heavy page resources (the profile header is client-rendered).
	await page.goto(`https://huggingface.co/${encodeURIComponent(username)}`, { waitUntil: "commit" });
	await page.waitForSelector("h1", { timeout: 20000 });

	// NOT_FOUND detection first (failure-first, before normal extraction).
	const notFound = await page.evaluate(() => {
		const h1 = document.querySelector("h1");
		return /^404/.test(h1 ? h1.innerText.trim() : "") || document.title.includes("404");
	});
	if (notFound) {
		const err = new Error("[NOT_FOUND] user or organization does not exist");
		err.code = "NOT_FOUND";
		throw err;
	}

	// Polite pacing: light random scroll + mouse move + random wait (best-effort, keeps ≤10s budget).
	try {
		await page.evaluate(() => window.scrollBy(0, Math.floor(Math.random() * 250)));
		await page.mouse.move(100 + Math.floor(Math.random() * 400), 100 + Math.floor(Math.random() * 300));
	} catch (e) {
		// polite pacing gestures are best-effort
	}
	await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));

	// Extract profile fields from the profile page DOM.
	const profile = await page.evaluate(() => {
		const username = location.pathname.replace(/^\//, "");
		const h1 = document.querySelector("h1");
		const h1a = h1 ? h1.querySelector("a[title]") : null;
		const display_name = h1a
			? h1a.getAttribute("title").trim()
			: (h1 ? h1.innerText.replace(/PRO$/, "").trim() : username);
		const is_pro = !!(h1 && h1.querySelector('a[href="/pro"]'));
		const ogTitle = document.querySelector('meta[property="og:title"]');
		const og_title = ogTitle ? ogTitle.content : "";

		// followers: users expose a "N followers" button; orgs embed the count in the Follow button.
		let followers = null;
		const folBtn = Array.from(document.querySelectorAll("button")).find((b) =>
			/^[\d,.]+[\s]*followers$/i.test((b.innerText || "").trim())
		);
		if (folBtn) followers = parseInt(folBtn.innerText.replace(/[^\d]/g, ""), 10);
		if (followers === null) {
			const t = document.querySelector('[title*="followers"], [title*="Followers"]');
			if (t) followers = parseInt(t.innerText.replace(/[^\d]/g, ""), 10);
		}
		if (followers === null) {
			const fb = Array.from(document.querySelectorAll("button")).find((b) =>
				/^Follow\s+[\d,.]+$/.test((b.innerText || "").replace(/\s+/g, " ").trim())
			);
			if (fb) followers = parseInt(fb.innerText.replace(/[^\d]/g, ""), 10);
		}

		// following: users only; orgs have no following button (stays null).
		let following = null;
		const folBtn2 = Array.from(document.querySelectorAll("button")).find((b) =>
			/^[\d,.]+[\s]*following$/i.test((b.innerText || "").trim())
		);
		if (folBtn2) following = parseInt(folBtn2.innerText.replace(/[^\d]/g, ""), 10);

		const av = Array.from(document.querySelectorAll("img")).find((i) => (i.alt || "").includes("picture"));
		const avatar_url = av ? av.src : null;
		const profile_url = location.origin + location.pathname;

		return { username, display_name, is_pro, followers, following, profile_url, avatar_url, og_title };
	});

	// Guard: a repo/dataset/space page (input like org/name) shows a slash in og:title or h1.
	if (profile.og_title.includes("/") || profile.display_name.includes("/")) {
		const err = new Error("[NOT_FOUND] user or organization does not exist");
		err.code = "NOT_FOUND";
		throw err;
	}

	// Output data via HF internal author API (in-page fetch).
	await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));
	const apiData = await page.evaluate(async (username) => {
		const fetchJson = async (path) => {
			const r = await fetch(path, { headers: { accept: "application/json" } });
			return { status: r.status, body: r.ok ? await r.json().catch(() => null) : null };
		};
		const modelsRes = await fetchJson("/api/models?author=" + encodeURIComponent(username) + "&limit=1000");
		const datasetsRes = await fetchJson("/api/datasets?author=" + encodeURIComponent(username) + "&limit=1000");
		const spacesRes = await fetchJson("/api/spaces?author=" + encodeURIComponent(username) + "&limit=1000");
		if (modelsRes.status !== 200 || datasetsRes.status !== 200 || spacesRes.status !== 200) {
			return { apiError: true, statuses: [modelsRes.status, datasetsRes.status, spacesRes.status] };
		}
		const models = (modelsRes.body || []).map((m) => ({ id: m.id, likes: m.likes, downloads: m.downloads }));
		return {
			models,
			dataset_count: (datasetsRes.body || []).length,
			space_count: (spacesRes.body || []).length
		};
	}, profile.username);

	if (apiData.apiError) {
		const err = new Error("[NETWORK_ERROR] Hugging Face author API request failed");
		err.code = "NETWORK_ERROR";
		throw err;
	}

	return {
		username: profile.username,
		display_name: profile.display_name,
		is_pro: profile.is_pro,
		followers: profile.followers,
		following: profile.following,
		profile_url: profile.profile_url,
		avatar_url: profile.avatar_url,
		models: apiData.models,
		dataset_count: apiData.dataset_count,
		space_count: apiData.space_count
	};
};
