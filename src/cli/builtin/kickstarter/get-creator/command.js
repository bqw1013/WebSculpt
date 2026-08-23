const DEFAULT_MAX_PAGES = 6;
const PAGE_SIZE = 32;

function fail(code, message) {
	const error = new Error(`[${code}] ${message}`);
	error.code = code;
	throw error;
}

function normalizeSlug(creator) {
	const text = String(creator).trim();
	if (!text) fail("MISSING_PARAM", "required parameter 'creator' is missing or empty");
	let slug = text;
	const urlMatch = text.match(/kickstarter\.com\/profile\/([^\/?#]+)/i);
	if (urlMatch) {
		slug = urlMatch[1];
	} else {
		const pathMatch = text.match(/\/profile\/([^\/?#]+)/i);
		if (pathMatch) slug = pathMatch[1];
	}
	try { slug = decodeURIComponent(slug); } catch (e) { /* keep raw slug */ }
	slug = slug.replace(/^\/+|\/+$/g, "");
	if (!/^[A-Za-z0-9_-]+$/.test(slug)) {
		fail("INVALID_PARAM", `creator must be a profile slug or /profile/{slug} URL, got '${creator}'`);
	}
	return slug;
}

function parseMaxPages(value) {
	const text = value === undefined || value === "" ? String(DEFAULT_MAX_PAGES) : String(value).trim();
	if (!/^\d+$/.test(text) || Number(text) < 1 || Number(text) > 20) {
		fail("INVALID_PARAM", `max_pages must be an integer between 1 and 20, got '${value}'`);
	}
	return Number(text);
}

async function readPageState(page) {
	return page.evaluate(() => {
		const body = document.body ? document.body.innerText || "" : "";
		const title = document.title || "";
		return { body: body.slice(0, 4000), title, lower: `${title}\n${body}`.toLowerCase() };
	});
}

function isNotFound(state) {
	return /doesn't exist \(404\)|back it up|we can't find this page/.test(state.lower);
}

function isBlocked(status, state) {
	return status === 403 || status === 429 ||
		/cloudflare|just a moment|security verification|captcha|正在进行安全验证|请完成安全验证/.test(state.lower);
}

function blockedResult(slug, status, reason) {
	return {
		source: "kickstarter",
		profile_slug: slug,
		name: null,
		profile_url: `https://www.kickstarter.com/profile/${slug}`,
		bio: null,
		website: null,
		location: null,
		joined_at: null,
		backed_count: null,
		created_count: null,
		created_projects: [],
		truncated: false,
		error: { code: "PLATFORM_BLOCKED", status: status || 403, reason }
	};
}

async function navigate(page, url) {
	let response;
	try {
		response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
	} catch (error) {
		const state = await readPageState(page).catch(() => ({ title: "", lower: "" }));
		if (isNotFound(state)) fail("NOT_FOUND", `Creator profile not found at ${url}`);
		if (isBlocked(null, state)) return { ok: false, blocked: blockedResult(null, 403, "Cloudflare challenge during navigation") };
		fail("PLATFORM_BLOCKED", `Kickstarter navigation failed: ${error.message}`);
	}
	const httpStatus = response && typeof response.status === "function" ? response.status() : null;
	const state = await readPageState(page);
	if (isNotFound(state)) fail("NOT_FOUND", `Creator profile not found at ${url}`);
	if (isBlocked(httpStatus, state)) return { ok: false, blocked: blockedResult(null, httpStatus || 403, "Cloudflare / platform blocking verification") };
	return { ok: true, state, httpStatus };
}

async function extractProfile(page) {
	return page.evaluate(() => {
		const nameEl = document.querySelector(".profile_bio h2 a");
		const backedEl = document.querySelector(".profile_bio .backed");
		const locEl = document.querySelector(".profile_bio .location a");
		const joinedEl = document.querySelector(".profile_bio .joined time");
		const backedText = backedEl ? backedEl.textContent.trim() : "";
		const backedMatch = backedText.match(/(\d+)/);
		const createdTab = Array.from(document.querySelectorAll('a[href*="/created"]'))
			.find((a) => /\/created$|\/created[?#]/.test(a.getAttribute("href") || ""));
		const tabText = createdTab ? createdTab.textContent.trim() : "";
		const totalMatch = tabText.match(/(\d+)/);
		return {
			name: nameEl ? nameEl.textContent.trim() : null,
			backed_count: backedMatch ? parseInt(backedMatch[1], 10) : null,
			location: locEl ? locEl.textContent.trim() : null,
			joined_at: joinedEl ? joinedEl.getAttribute("datetime") : null,
			created_total: totalMatch ? parseInt(totalMatch[1], 10) : null
		};
	});
}

async function extractBio(page) {
	return page.evaluate(() => {
		const container = document.querySelector(".grid-col-12.grid-col-10-sm.grid-col-8-md.grid-col-center");
		let bio = null;
		let website = null;
		if (container) {
			const rows = container.querySelectorAll(".grid-row");
			for (const row of rows) {
				const label = row.querySelector("h5");
				if (!label) continue;
				const labelText = label.textContent.trim();
				if (/履歷|傳記|Biograph/i.test(labelText)) {
					const ps = Array.from(row.querySelectorAll("p")).filter((p) => p.textContent.trim().length > 0);
					if (ps.length > 0) bio = ps[ps.length - 1].textContent.trim();
				}
				if (/網站|Website/i.test(labelText)) {
					const a = row.querySelector('a[target="_blank"]');
					if (a) website = a.href;
				}
			}
		}
		if (!website) {
			const a = document.querySelector(".menu-submenu a[target='_blank']");
			if (a) website = a.href;
		}
		return { bio, website };
	});
}

function normalizeProject(p) {
	return {
		id: typeof p.id === "number" ? p.id : (p.id || null),
		name: p.name || null,
		slug: p.slug || null,
		url: (p.urls && p.urls.web && p.urls.web.project) || null,
		state: p.state || null,
		percent_funded: typeof p.percent_funded === "number" ? p.percent_funded : null,
		pledged: typeof p.pledged === "number" ? p.pledged : null,
		goal: typeof p.goal === "number" ? p.goal : null,
		currency: p.currency || null,
		backers_count: typeof p.backers_count === "number" ? p.backers_count : null,
		deadline: typeof p.deadline === "number" ? p.deadline : null,
		launched_at: typeof p.launched_at === "number" ? p.launched_at : null,
		is_launched: typeof p.is_launched === "boolean" ? p.is_launched : null
	};
}

async function readProjectsPage(page) {
	return page.evaluate(() => {
		const el = document.querySelector("[data-projects]");
		if (!el) return { projects: null };
		const raw = el.getAttribute("data-projects");
		let parsed = null;
		try {
			parsed = JSON.parse(raw);
		} catch (errPlain) {
			try {
				parsed = JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"));
			} catch (errEscaped) {
				parsed = [];
			}
		}
		return { projects: Array.isArray(parsed) ? parsed : [] };
	});
}

export default async (page, params, cwd) => {
	const slug = normalizeSlug(params.creator);
	const maxPages = parseMaxPages(params.max_pages);
	const profileUrl = `https://www.kickstarter.com/profile/${slug}`;

	let nav = await navigate(page, `${profileUrl}/about`);
	if (!nav.ok) return nav.blocked;
	await page.waitForTimeout(300 + Math.floor(Math.random() * 400));
	const profile = await extractProfile(page);
	const about = await extractBio(page);

	const createdProjects = [];
	let totalCreated = profile.created_total || null;
	let hitEmptyPage = false;

	for (let pageNum = 1; pageNum <= maxPages; pageNum += 1) {
		const url = pageNum === 1 ? `${profileUrl}/created` : `${profileUrl}/created?page=${pageNum}`;
		nav = await navigate(page, url);
		if (!nav.ok) return nav.blocked;
		await page.waitForTimeout(300 + Math.floor(Math.random() * 500));
		const { projects } = await readProjectsPage(page);
		if (projects === null) {
			hitEmptyPage = true;
			break;
		}
		for (const p of projects) createdProjects.push(normalizeProject(p));
		if (totalCreated != null && createdProjects.length >= totalCreated) break;
		if (projects.length < PAGE_SIZE && projects.length > 0) break;
	}

	let truncated;
	if (totalCreated != null) {
		truncated = createdProjects.length < totalCreated;
	} else {
		truncated = !hitEmptyPage;
	}

	return {
		source: "kickstarter",
		name: profile.name,
		profile_slug: slug,
		profile_url: profileUrl,
		bio: about.bio,
		website: about.website,
		location: profile.location,
		joined_at: profile.joined_at,
		backed_count: profile.backed_count,
		created_count: totalCreated != null ? totalCreated : createdProjects.length,
		created_projects: createdProjects,
		truncated,
		error: null
	};
};
