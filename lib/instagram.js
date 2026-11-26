// Thin wrappers around the Instagram Graph API.
//
// Two kinds of token exist, and each only works on its own host:
//   "IGAA..." (Instagram Login)            → graph.instagram.com
//   "EAA..."  (Unified / Facebook Login)   → graph.facebook.com
// The host is picked automatically from the token.

const VERSION = "v27.0";
const env = () => process.env;
export const graphBase = (token = env().IG_ACCESS_TOKEN ?? "") =>
  token.startsWith("EAA")
    ? `https://graph.facebook.com/${VERSION}`
    : `https://graph.instagram.com/${VERSION}`;

async function call(method, path, body) {
  const res = await fetch(`${graphBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env().IG_ACCESS_TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  return { ok: res.ok, data, error: data?.error?.message };
}

// ---------- message builders ----------
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// buttons: [{ type: "postback", title, payload } | { type: "web_url", title, url }]
export const buttonMessage = (text, buttons) => ({
  attachment: {
    type: "template",
    payload: {
      template_type: "button",
      text: clip(text || " ", 640),
      buttons: buttons.slice(0, 3).map((b) => ({ ...b, title: clip(b.title || "Open", 20) })),
    },
  },
});

/**
 * Send a DM. `to` is { id } (a person) or { comment_id } (private reply to a
 * comment). If `message` is a button template and Instagram rejects it, the
 * plain-text `fallbackText` is sent instead.
 */
export async function sendMessage(to, message, fallbackText, label = "DM") {
  const send = (m) => call("POST", `/${env().IG_USER_ID}/messages`, { recipient: to, message: m });
  let r = await send(message);
  if (!r.ok && message.attachment && fallbackText) {
    console.warn(`${label}: button message rejected (${r.error}); sending text instead`);
    r = await send({ text: fallbackText });
    return log(`${label} (text fallback)`, r);
  }
  return log(label, r);
}

export async function replyToComment(commentId, message) {
  return log("Public reply", await call("POST", `/${commentId}/replies`, { message }));
}

// Returns { username, follows }: follows is true/false, or null if the check failed.
export async function getUserProfile(userId) {
  const r = await call("GET", `/${userId}?fields=username,is_user_follow_business`);
  if (!r.ok) {
    console.error("Profile lookup FAILED:", JSON.stringify(r.data));
    return { username: undefined, follows: null, error: r.error };
  }
  const f = r.data.is_user_follow_business;
  return { username: r.data.username, follows: typeof f === "boolean" ? f : null };
}

// ---------- used by the dashboard ----------
export async function getAccount() {
  const r = await call(
    "GET",
    `/${env().IG_USER_ID}?fields=username,name,profile_picture_url,followers_count,media_count`
  );
  return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error ?? "Could not reach Instagram" };
}

export async function getMedia({ after, limit = 30 } = {}) {
  const fields =
    "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,comments_count,like_count";
  const q = new URLSearchParams({ fields, limit: String(limit) });
  if (after) q.set("after", after);
  const r = await call("GET", `/${env().IG_USER_ID}/media?${q}`);
  if (!r.ok) return { ok: false, error: r.error ?? "Could not load posts" };
  return {
    ok: true,
    items: (r.data.data ?? []).map((m) => ({
      id: m.id,
      caption: m.caption ?? "",
      type: m.media_product_type === "REELS" ? "REEL" : m.media_type,
      thumb: m.thumbnail_url ?? m.media_url ?? null,
      permalink: m.permalink,
      timestamp: m.timestamp,
      comments: m.comments_count ?? 0,
      likes: m.like_count ?? 0,
    })),
    after: r.data.paging?.next ? r.data.paging?.cursors?.after : null,
  };
}

function log(label, r) {
  if (r.ok) console.log(`${label} OK:`, JSON.stringify(r.data));
  else console.error(`${label} FAILED:`, JSON.stringify(r.data));
  return r;
}
