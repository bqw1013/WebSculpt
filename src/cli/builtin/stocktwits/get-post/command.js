// stocktwits/get-post
// 获取单条 Stocktwits 帖子全文，可选展开其回复线程（讨论楼）。
//
// 端点（公开 JSON API，匿名可用，UA=Chrome）：
//   GET https://api.stocktwits.com/api/2/messages/show/{id}.json            -> {message, response}
//   GET https://api.stocktwits.com/api/2/messages/{id}/conversation.json?limit=30&since={cursor}
//                                                                            -> {parent, message, children:{messages, cursor}}
//
// 实测结构要点：
//   - conversation 顶层是 {parent, message, children:{messages, cursor}}，回复在 children.messages（不是 {parent, replies}）。
//   - 常规帖（discussion=false）无 likes/conversation 字段 -> likeCount/replyCount 为 null；
//     仅讨论/投票帖（discussion=true）才有 likes.total 与 conversation.replies（陈旧近似值）。
//   - 回复按 id 升序（最早在前）；用 ?since={cursor.since} 取更新回复，?limit 单页上限 30。
//   - 不存在/非数字 id -> HTTP 404 {"errors":[{"message":"Message not found"}]}。
//   - 帖子无稳定公开 permalink 页，url 按 https://stocktwits.com/{username}/message/{id} 构造。
//
// 礼貌限速：每次请求前随机 sleep 200-700ms；429/403/连接错误退避重试（最多 3 次）。

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const API = "https://api.stocktwits.com/api/2";

// 每次请求前的礼貌随机间隔（200-700ms）
function sleepRandom() {
  const ms = 200 + Math.floor(Math.random() * 501);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 业务错误：消息含 [CODE]，并携带 err.code 供 runner 透传
function makeError(code, msg) {
  const err = new Error("[" + code + "] " + msg);
  err.code = code;
  return err;
}

// JSON GET，带退避重试：
//   - 404                 -> NOT_FOUND（不重试）
//   - 429/403             -> 退避重试（最多 3 次）后 RATE_LIMITED
//   - 连接失败/超时        -> 退避重试（最多 3 次）后 NETWORK_ERROR
//   - 其余非 2xx / 非 JSON -> API_ERROR（不重试）
async function getJSON(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await sleepRandom();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "follow",
        signal: controller.signal
      });

      if (res.status === 404) {
        throw makeError("NOT_FOUND", "Stocktwits message not found (id does not exist)");
      }
      if (res.status === 429 || res.status === 403) {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 1000 + attempt * 1000));
          continue;
        }
        throw makeError("RATE_LIMITED", "Stocktwits rate-limited the request (HTTP " + res.status + ")");
      }
      if (!res.ok) {
        throw makeError("API_ERROR", "Stocktwits returned HTTP " + res.status);
      }

      let data;
      try {
        data = await res.json();
      } catch (_parseErr) {
        throw makeError("API_ERROR", "Stocktwits returned a non-JSON response (HTTP " + res.status + ")");
      }
      return data;
    } catch (e) {
      // 已携带错误码的业务错误不重试，直接透传
      if (e && e.code) throw e;
      // 网络/超时错误：退避重试
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 600 + attempt * 600));
        continue;
      }
      if (e && e.name === "AbortError") {
        throw makeError("NETWORK_ERROR", "Stocktwits request timed out");
      }
      throw makeError("NETWORK_ERROR", "Failed to reach Stocktwits: " + (e && e.message ? e.message : String(e)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw makeError("NETWORK_ERROR", "Failed to reach Stocktwits");
}

// 帖子 URL：无稳定公开 permalink 页，按契约构造 deeplink
function postUrl(username, id) {
  return "https://stocktwits.com/" + (username || "user") + "/message/" + id;
}

// 将 API user 对象映射为输出字段（avatarUrl 优先 avatar_url，回退 avatar_url_ssl）
function mapUser(u) {
  if (!u) return null;
  return {
    id: typeof u.id === "number" ? u.id : null,
    username: u.username || null,
    name: u.name || null,
    avatarUrl: u.avatar_url || u.avatar_url_ssl || null,
    followers: typeof u.followers === "number" ? u.followers : null,
    ideas: typeof u.ideas === "number" ? u.ideas : null
  };
}

// 主帖 message -> 顶层输出结构
function mapMessage(m) {
  const sentiment = m.entities && m.entities.sentiment ? m.entities.sentiment.basic || null : null;
  const username = m.user && m.user.username ? m.user.username : null;
  return {
    id: m.id || null,
    url: postUrl(username, m.id),
    body: m.body || null,
    createdAt: m.created_at || null,
    sentiment: sentiment,
    // 仅讨论/投票帖（discussion=true）API 提供 likes.total；常规帖无此字段 -> null
    likeCount: m.likes && typeof m.likes.total === "number" ? m.likes.total : null,
    // message.conversation.replies 为陈旧近似值，仅讨论帖有；常规帖 -> null
    replyCount: m.conversation && typeof m.conversation.replies === "number" ? m.conversation.replies : null,
    discussion: !!m.discussion,
    user: mapUser(m.user),
    symbols: Array.isArray(m.symbols) ? m.symbols.map((s) => s && s.symbol).filter(Boolean) : []
  };
}

// 回复 message -> conversation.replies 元素
function mapReply(r) {
  const sentiment = r.entities && r.entities.sentiment ? r.entities.sentiment.basic || null : null;
  const username = r.user && r.user.username ? r.user.username : null;
  return {
    id: r.id || null,
    url: postUrl(username, r.id),
    body: r.body || null,
    createdAt: r.created_at || null,
    sentiment: sentiment,
    likeCount: r.likes && typeof r.likes.total === "number" ? r.likes.total : null,
    user: mapUser(r.user)
  };
}

// 目标 id 为回复时的根帖 OP -> conversation.parent 元素；根帖为 null
function mapParent(p) {
  if (!p) return null;
  const username = p.user && p.user.username ? p.user.username : null;
  return {
    id: p.id || null,
    url: postUrl(username, p.id),
    body: p.body || null,
    createdAt: p.created_at || null,
    user: mapUser(p.user)
  };
}

// 抓回复线程：按 since 游标翻页（单页上限 30），累计到 replyLimit 或线程耗尽
// 返回 { parent, replies, more }；more = 是否还有更深回复可翻
async function fetchConversation(id, replyLimit) {
  const replies = [];
  let since = null;
  let more = true;
  let parent = null;

  while (more && replies.length < replyLimit) {
    const pageSize = Math.min(30, replyLimit - replies.length);
    let url = API + "/messages/" + id + "/conversation.json?limit=" + pageSize;
    if (since) url += "&since=" + since;

    const data = await getJSON(url);
    const children = data && data.children;
    if (!children || !Array.isArray(children.messages)) {
      throw makeError("API_ERROR", "Unexpected Stocktwits conversation response: missing children.messages");
    }

    if (data.parent !== undefined) parent = mapParent(data.parent);

    for (const kid of children.messages) replies.push(mapReply(kid));

    const cursor = children.cursor || {};
    more = !!cursor.more && children.messages.length > 0;
    since = cursor.since || null;
  }

  return { parent: parent, replies: replies, more: more };
}

export default async function(params) {
  // id：必填，数字帖子 id；先用正则校验原始串再使用（禁止 parseInt 截断）
  const rawId = String(params.id || "").trim();
  if (!rawId) {
    throw makeError("MISSING_PARAM", "id is required (numeric Stocktwits post id)");
  }
  if (!/^\d+$/.test(rawId)) {
    throw makeError("INVALID_PARAM", "id must be a positive integer (got \"" + rawId + "\")");
  }
  const id = rawId;

  // include_replies：布尔，默认 false（manifest default 注入，代码不写 fallback）
  const includeRepliesRaw = String(params.include_replies);
  if (includeRepliesRaw !== "true" && includeRepliesRaw !== "false") {
    throw makeError("INVALID_PARAM", "include_replies must be true or false (got \"" + includeRepliesRaw + "\")");
  }
  const includeReplies = includeRepliesRaw === "true";

  // reply_limit：数字，1-100，仅 include_replies=true 生效；正则校验原始串后再转换
  let replyLimit = 20;
  if (includeReplies) {
    const rawLimit = String(params.reply_limit);
    if (!/^\d+$/.test(rawLimit)) {
      throw makeError("INVALID_PARAM", "reply_limit must be a positive integer (got \"" + rawLimit + "\")");
    }
    replyLimit = parseInt(rawLimit, 10);
    if (replyLimit < 1 || replyLimit > 100) {
      throw makeError("INVALID_PARAM", "reply_limit must be between 1 and 100 (got " + replyLimit + ")");
    }
  }

  // 1) 全文
  const show = await getJSON(API + "/messages/show/" + id + ".json");
  const message = show && show.message;
  if (!message) {
    throw makeError("API_ERROR", "Unexpected Stocktwits response: missing message field");
  }

  const result = mapMessage(message);

  // 2) 可选回复线程
  if (includeReplies) {
    const convo = await fetchConversation(id, replyLimit);
    result.conversation = { parent: convo.parent, replies: convo.replies, more: convo.more };
    // 到达 reply_limit 且线程未耗尽 -> 回复列表为部分结果
    result.partial = convo.more;
  } else {
    result.conversation = undefined;
    result.partial = false;
  }

  return result;
}
