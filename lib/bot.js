// The flow: comment → (public reply) → opener DM with button → follow check →
// resources. Automations come from the dashboard (lib/store.js).
import * as ig from "./instagram.js";
import * as store from "./store.js";
import {
  findForComment,
  findForDmText,
  usesOpener,
  fill,
  deliveryText,
} from "./automations.js";

const PAYLOAD_PREFIX = "GET:";
const isMe = (id) =>
  id && process.env.IG_USER_ID && String(id) === String(process.env.IG_USER_ID);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- Comment on a post/reel ----------
export async function handleComment(c) {
  const commentId = c?.id;
  const username = c?.from?.username;
  const mediaId = c?.media?.id;
  console.log(`Comment from @${username} on media ${mediaId}: "${c?.text}"`);

  if (!commentId) return;
  if (isMe(c?.from?.id)) return; // our own comments/replies -> prevents loops
  if (c?.parent_id) return; // only top-level comments

  const settings = await store.getSettings();
  if (settings.paused) return console.log("Bot is paused, skipping");

  const a = findForComment(await store.getAutomations(), mediaId, c?.text);
  if (!a) return console.log("No automation for this reel/comment, skipping");
  if (!(await store.claimOnce("c:" + commentId))) return console.log("Duplicate webhook, skipping");

  console.log(`Automation "${a.name}" (${a.id}) matched`);
  await store.incrStat(a.id, "comments");
  const base = { automationId: a.id, automation: a.name, user: username, mediaId, text: c?.text };

  if (usesOpener(a)) {
    const text = fill(a.opener.text || "Tap below 👇", username);
    const keyword = a.trigger.keywords[0];
    const fallback = keyword ? `${text}\n\nReply "${keyword}" here and I'll send it 👇` : text;
    const r = await ig.sendMessage(
      { comment_id: commentId },
      ig.buttonMessage(text, [
        { type: "postback", title: a.opener.button || "Send it", payload: PAYLOAD_PREFIX + a.id },
      ]),
      fallback,
      "Opener DM"
    );
    if (r.ok) await store.incrStat(a.id, "openers");
    await store.logActivity({ ...base, type: "opener", ok: r.ok, error: r.error });
  } else {
    const r = await sendDelivery({ comment_id: commentId }, a, username);
    if (r.ok) await store.incrStat(a.id, "delivered");
    await store.logActivity({ ...base, type: "delivered", ok: r.ok, error: r.error });
  }

  if (a.publicReplies.length) {
    const r = await ig.replyToComment(commentId, fill(pick(a.publicReplies), username));
    if (!r.ok) await store.logActivity({ ...base, type: "public_reply", ok: false, error: r.error });
  }
}

// ---------- DM events: button taps and typed messages ----------
export async function handleMessaging(m) {
  const senderId = m?.sender?.id;
  if (!senderId || isMe(senderId)) return; // ignore our own outgoing messages
  if (m.message?.is_echo) return;

  const payload = m.postback?.payload ?? m.message?.quick_reply?.payload;
  const text = m.message?.text;
  if (!payload && !text) return; // seen receipts, reactions, etc.

  const settings = await store.getSettings();
  if (settings.paused) return console.log("Bot is paused, skipping");

  const list = await store.getAutomations();
  let a = null;
  if (payload?.startsWith(PAYLOAD_PREFIX)) {
    const id = payload.slice(PAYLOAD_PREFIX.length);
    a = list.find((x) => x.id === id && x.enabled) ?? null;
  } else if (text) {
    a = findForDmText(list, text);
  }
  if (!a) return console.log(`DM from ${senderId} matched no automation, leaving it for you`);

  const mid = m.postback?.mid ?? m.message?.mid;
  if (mid && !(await store.claimOnce("m:" + mid))) return console.log("Duplicate webhook, skipping");

  console.log(`DM trigger from ${senderId} for automation "${a.name}"`);
  await deliver(senderId, a, settings);
}

// Check follow (if required), then send the resources or the follow prompt.
async function deliver(userId, a, settings) {
  const { username, follows } = await ig.getUserProfile(userId);
  const base = { automationId: a.id, automation: a.name, user: username ?? userId };

  if (a.requireFollow) {
    const allowed =
      follows === true || (follows === null && settings.sendResourceIfFollowCheckFails);
    console.log(`@${username ?? userId} follows=${follows} -> ${allowed ? "deliver" : "ask to follow"}`);
    if (!allowed) {
      const text = fill(a.followPrompt.text || "Please follow me first, then tap below 🙌", username);
      const r = await ig.sendMessage(
        { id: userId },
        ig.buttonMessage(text, [
          { type: "postback", title: a.followPrompt.button || "I followed ✅", payload: PAYLOAD_PREFIX + a.id },
        ]),
        `${text}\n\nReply "${a.trigger.keywords[0] ?? "done"}" once you've followed.`,
        "Follow prompt"
      );
      if (r.ok) await store.incrStat(a.id, "followPrompts");
      await store.logActivity({ ...base, type: "follow_prompt", ok: r.ok, error: r.error });
      return;
    }
  }

  const r = await sendDelivery({ id: userId }, a, username);
  if (r.ok) await store.incrStat(a.id, "delivered");
  await store.logActivity({
    ...base,
    type: "delivered",
    ok: r.ok,
    error: r.error,
    followCheck: a.requireFollow ? follows : undefined,
  });
}

// Resources as link buttons (up to 3) or as a text message.
function sendDelivery(to, a, username) {
  const { resources, style } = a.delivery;
  const text = deliveryText(a, username);
  if (style === "buttons" && resources.length >= 1 && resources.length <= 3) {
    const msg = ig.buttonMessage(fill(a.delivery.message, username) || "Here you go 👇", [
      ...resources.map((r) => ({ type: "web_url", title: r.title || "Open link", url: r.url })),
    ]);
    return ig.sendMessage(to, msg, text, "Resources DM");
  }
  return ig.sendMessage(to, { text }, null, "Resources DM");
}
