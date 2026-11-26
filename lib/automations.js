// The automation model: one automation = "when someone comments X on these
// reels, do this". Shared by the bot and the dashboard API.

const str = (v, max = 1000) => (typeof v === "string" ? v : v == null ? "" : String(v)).slice(0, max);
const strList = (v, max = 100) =>
  (Array.isArray(v) ? v : []).map((x) => str(x, 300).trim()).filter(Boolean).slice(0, max);

export const LIMITS = { buttonTitle: 20, text: 640, resources: 10 };

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

export function normalizeAutomation(a = {}) {
  const scope = a.scope === "all" ? "all" : "media";
  const resources = (Array.isArray(a.delivery?.resources) ? a.delivery.resources : [])
    .map((r) => ({ title: str(r?.title, 80).trim(), url: str(r?.url, 1000).trim() }))
    .filter((r) => r.url)
    .slice(0, LIMITS.resources);

  return {
    id: /^[a-z0-9_-]{1,40}$/i.test(a.id ?? "") ? a.id : newId(),
    name: str(a.name, 80).trim() || "Untitled automation",
    enabled: a.enabled !== false,
    scope, // "media" = only the reels in mediaIds; "all" = every post except excludeMediaIds
    mediaIds: strList(a.mediaIds, 200),
    excludeMediaIds: strList(a.excludeMediaIds, 200),
    trigger: {
      anyComment: Boolean(a.trigger?.anyComment),
      keywords: strList(a.trigger?.keywords, 30).map((k) => k.toLowerCase()),
      matchMode: a.trigger?.matchMode === "word" ? "word" : "contains",
      dmKeywords: a.trigger?.dmKeywords !== false, // typing the keyword in DMs also works
    },
    publicReplies: strList(a.publicReplies, 10), // one is picked at random per comment
    opener: {
      enabled: a.opener?.enabled !== false,
      text: str(a.opener?.text, LIMITS.text),
      button: str(a.opener?.button, LIMITS.buttonTitle),
    },
    requireFollow: Boolean(a.requireFollow),
    followPrompt: {
      text: str(a.followPrompt?.text, LIMITS.text),
      button: str(a.followPrompt?.button, LIMITS.buttonTitle),
    },
    delivery: {
      message: str(a.delivery?.message, LIMITS.text),
      resources,
      style: a.delivery?.style === "text" ? "text" : "buttons",
    },
    createdAt: a.createdAt ?? null,
    updatedAt: a.updatedAt ?? null,
  };
}

// Convert a rule from the old config.js format.
export function fromLegacyRule(r) {
  return normalizeAutomation({
    id: r.id,
    name: r.id ? `${r.id[0].toUpperCase()}${r.id.slice(1)} (from config.js)` : "From config.js",
    scope: r.mediaIds?.length ? "media" : "all",
    mediaIds: r.mediaIds ?? [],
    trigger: { keywords: r.keywords ?? [] },
    publicReplies: r.publicReply ? [r.publicReply] : [],
    opener: { enabled: true, ...(r.opener ?? {}) },
    requireFollow: Boolean(r.requireFollow),
    followPrompt: r.followPrompt ?? {},
    delivery: { message: r.resource ?? "", resources: [], style: "text" },
  });
}

// A follow check needs the person to interact first, so a follow-gated
// automation always starts with the opener button.
export const usesOpener = (a) => a.requireFollow || a.opener.enabled;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function keywordMatches(a, text) {
  const t = (text ?? "").toLowerCase();
  return a.trigger.keywords.some((k) =>
    a.trigger.matchMode === "word"
      ? new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(k)}($|[^\\p{L}\\p{N}])`, "u").test(t)
      : t.includes(k)
  );
}

export function appliesToMedia(a, mediaId) {
  if (a.scope === "all") return !a.excludeMediaIds.includes(mediaId);
  return Boolean(mediaId) && a.mediaIds.includes(mediaId);
}

// Reel-specific automations win over "all posts" ones.
export function findForComment(list, mediaId, text) {
  const candidates = list
    .filter((a) => a.enabled && appliesToMedia(a, mediaId))
    .sort((x, y) => (x.scope === "media" ? 0 : 1) - (y.scope === "media" ? 0 : 1));
  return (
    candidates.find((a) => a.trigger.keywords.length && keywordMatches(a, text)) ??
    candidates.find((a) => a.trigger.anyComment) ??
    null
  );
}

export function findForDmText(list, text) {
  return list.find((a) => a.enabled && a.trigger.dmKeywords && keywordMatches(a, text)) ?? null;
}

export const fill = (text, username) => (text ?? "").replaceAll("{username}", username ?? "there");

// The final message, as a text fallback (message + each resource on its own line).
export function deliveryText(a, username) {
  const parts = [fill(a.delivery.message, username)];
  for (const r of a.delivery.resources) parts.push(r.title ? `🔗 ${r.title}\n${r.url}` : r.url);
  return parts.filter(Boolean).join("\n\n").slice(0, 1000) || "🙌";
}
