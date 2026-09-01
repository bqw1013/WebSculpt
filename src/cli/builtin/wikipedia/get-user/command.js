// Wikipedia get-user: fetch public editor statistics via MediaWiki Action API.
// Runtime: node. No browser fallback.

import { execFile } from "node:child_process";

const USER_AGENT = "WebSculpt-wikipedia-get-user/1.0 (research automation; node runtime)";

function makeError(code, message) {
  const err = new Error(`[${code}] ${message}`);
  err.code = code;
  return err;
}

function normalizeUsername(raw) {
  if (!raw || !raw.trim()) {
    return null;
  }
  let user = raw.trim();
  if (/^https?:\/\//i.test(user)) {
    try {
      const url = new URL(user);
      const parts = url.pathname.split("/").filter(Boolean);
      const last = parts.pop();
      if (!last) {
        return null;
      }
      user = decodeURIComponent(last);
    } catch {
      throw makeError("INVALID_PARAM", "Invalid user page URL provided");
    }
  }
  // Strip optional "User:" namespace prefix from input.
  user = user.replace(/^User:/i, "");
  return user.trim();
}

async function httpFetch(url, options = {}) {
  const ua = options.headers?.["User-Agent"] || USER_AGENT;
  return new Promise((resolve, reject) => {
    execFile(
      "curl",
      [
        "-sS",
        "-L",
        "--max-time",
        String(options.timeout || 30),
        "-A",
        ua,
        "-w",
        "\n%{http_code}",
        url,
      ],
      { env: process.env, maxBuffer: 1024 * 1024 * 10 },
      (err, stdout) => {
        if (err) {
          const msg = err.message || "";
          if (msg.includes("28")) {
            reject(makeError("NETWORK_ERROR", "Request timeout"));
            return;
          }
          if (msg.includes("Could not resolve") || msg.includes("Connection refused")) {
            reject(makeError("NETWORK_ERROR", msg));
            return;
          }
          reject(new Error(msg));
          return;
        }
        const lines = stdout.split("\n");
        const statusLine = lines.pop();
        const body = lines.join("\n");
        const status = Number.parseInt(statusLine, 10) || 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      }
    );
  });
}

async function fetchJson(url, retry429 = true) {
  let attempts = 0;
  while (true) {
    const res = await httpFetch(url, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (res.ok) {
      return res.json();
    }
    if (res.status === 429) {
      attempts += 1;
      if (retry429 && attempts <= 5) {
        await new Promise((resolve) => setTimeout(resolve, attempts * 2000 + Math.floor(Math.random() * 1000)));
        continue;
      }
      throw makeError("RATE_LIMITED", "Rate limited by Wikipedia");
    }
    throw makeError("NETWORK_ERROR", `HTTP ${res.status} from ${url}`);
  }
}

function hasValue(value) {
  return value !== undefined && value !== null;
}

function setIfPresent(target, key, value) {
  if (hasValue(value)) {
    target[key] = value;
  }
}

export default async function(params) {
  const language = params.language || "zh";
  const rawUser = params.user;

  if (!rawUser) {
    throw makeError("INVALID_PARAM", "Missing required parameter: user");
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(language)) {
    throw makeError("INVALID_PARAM", `Invalid language code: ${language}`);
  }

  const username = normalizeUsername(rawUser);
  if (!username) {
    throw makeError("INVALID_PARAM", "Invalid or empty username");
  }

  const baseUrl = `https://${language}.wikipedia.org`;
  const encodedUser = encodeURIComponent(username);
  const usprop = ["editcount", "groups", "registration", "gender", "rights", "implicitgroups", "blockinfo"].join("|");
  const apiUrl = `${baseUrl}/w/api.php?action=query&list=users&ususers=${encodedUser}&usprop=${usprop}&format=json`;

  const data = await fetchJson(apiUrl);
  const users = data?.query?.users;
  if (!Array.isArray(users) || users.length === 0) {
    throw makeError("EMPTY_RESULT", "No user data returned");
  }

  const user = users[0];
  if (user.missing !== undefined || user.invalid !== undefined) {
    throw makeError("NOT_FOUND", "User not found");
  }

  const result = {
    name: user.name,
    url: `${baseUrl}/wiki/User:${encodeURIComponent(user.name.replace(/ /g, "_"))}`,
    language,
  };

  setIfPresent(result, "userid", user.userid);
  setIfPresent(result, "editcount", user.editcount);
  setIfPresent(result, "registration", user.registration);
  setIfPresent(result, "gender", user.gender);

  if (Array.isArray(user.groups) && user.groups.length > 0) {
    result.groups = user.groups;
    result.is_bot = user.groups.includes("bot");
    result.is_admin = user.groups.includes("sysop");
  }

  if (Array.isArray(user.implicitgroups) && user.implicitgroups.length > 0) {
    result.implicitgroups = user.implicitgroups;
  }

  if (Array.isArray(user.rights) && user.rights.length > 0) {
    result.rights = user.rights;
  }

  if (user.blockinfo && typeof user.blockinfo === "object") {
    result.is_blocked = true;
    result.blockinfo = {};
    setIfPresent(result.blockinfo, "blockedby", user.blockinfo.blockedby);
    setIfPresent(result.blockinfo, "blockedtimestamp", user.blockinfo.blockedtimestamp);
    setIfPresent(result.blockinfo, "blockreason", user.blockinfo.blockreason);
    // If blockinfo ended up empty, drop it to keep output clean.
    if (Object.keys(result.blockinfo).length === 0) {
      delete result.blockinfo;
      delete result.is_blocked;
    }
  }

  return result;
}