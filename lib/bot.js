import { rules, replyToAllComments, sendResourceIfFollowCheckFails } from "../config.js";
import * as ig from "./instagram.js";

const PAYLOAD_PREFIX = "GET:";
const fill = (text, username) => (text ?? "").replaceAll("{username}", username ?? "");
const isMe = (id) =>
  id && process.env.IG_USER_ID && String(id) === String(process.env.IG_USER_ID);

// ---------- Comment on a post/reel ----------
export async function handleComment(c) {
  const commentId = c?.id;
  const text = (c?.text ?? "").toLowerCase();
  const username = c?.from?.username;
  const mediaId = c?.media?.id;

  console.log(`Comment from @${username} on media ${mediaId}: "${c?.text}"`);

  if (!commentId) return;
  if (isMe(c?.from?.id)) return; // our own comments/replies -> prevents loops
  if (c?.parent_id) return; // only top-level comments

  const rule = findRuleForComment(text, mediaId);
  if (!rule) return console.log("No matching rule, skipping");

  const opener = fill(rule.opener.text, username);
  const fallback = `${opener}\n\nReply "${rule.keywords[0]}" here and I'll send it 👇`;
  await ig.privateReplyWithButton(commentId, opener, rule.opener.button, PAYLOAD_PREFIX + rule.id, fallback);

  if (rule.publicReply) await ig.replyToComment(commentId, fill(rule.publicReply, username));
}

// ---------- DM events: button taps and typed messages ----------
export async function handleMessaging(m) {
  const senderId = m?.sender?.id;
  if (!senderId || isMe(senderId)) return; // ignore our own outgoing messages
  if (m.message?.is_echo) return;

  const payload = m.postback?.payload ?? m.message?.quick_reply?.payload;
  let rule = null;

  if (payload?.startsWith(PAYLOAD_PREFIX)) {
    rule = rules.find((r) => r.id === payload.slice(PAYLOAD_PREFIX.length));
  } else if (m.message?.text) {
    const text = m.message.text.toLowerCase();
    rule = rules.find((r) => r.keywords.some((k) => text.includes(k.toLowerCase())));
  }

  if (!rule) return console.log(`DM from ${senderId} matched no rule, leaving it for you`);
  console.log(`DM trigger from ${senderId} for rule "${rule.id}"`);
  await deliver(senderId, rule);
}

// Check follow (if required), then send the resource or the follow prompt.
async function deliver(userId, rule) {
  const { username, follows } = await ig.getUserProfile(userId);

  if (rule.requireFollow) {
    const allowed = follows === true || (follows === null && sendResourceIfFollowCheckFails);
    console.log(`@${username ?? userId} follows=${follows} -> ${allowed ? "send resource" : "ask to follow"}`);
    if (!allowed) {
      await ig.sendButton(
        userId,
        fill(rule.followPrompt.text, username),
        rule.followPrompt.button,
        PAYLOAD_PREFIX + rule.id
      );
      return;
    }
  }

  await ig.sendText(userId, fill(rule.resource, username));
}

function findRuleForComment(text, mediaId) {
  const applies = (r) => !r.mediaIds?.length || r.mediaIds.includes(mediaId);
  const match = rules.find(
    (r) => applies(r) && r.keywords.some((k) => text.includes(k.toLowerCase()))
  );
  if (match) return match;
  if (replyToAllComments) return rules.find(applies) ?? null;
  return null;
}
