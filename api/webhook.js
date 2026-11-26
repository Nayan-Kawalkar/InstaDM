import crypto from "node:crypto";
import { handleComment, handleMessaging } from "../lib/bot.js";
import { recordWebhook } from "../lib/store.js";

// ---------- GET: Meta verifies your webhook URL once ----------
export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = (process.env.VERIFY_TOKEN ?? "").trim();
  if (!expected) console.error("VERIFY_TOKEN is not set in the environment.");
  if (mode === "subscribe" && expected && token?.trim() === expected) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------- POST: Meta sends comments, DMs and button taps here ----------
export async function POST(request) {
  const raw = await request.text();

  if (!isValidSignature(raw, request.headers.get("x-hub-signature-256"))) {
    console.warn("Invalid or missing signature, ignoring request");
    // Only count it if it looks like a real Meta delivery (has a signature header)
    if (request.headers.get("x-hub-signature-256")) await recordWebhook("bad_signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const jobs = [];
  const kinds = new Set();
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      kinds.add(change.field === "comments" ? "comment" : "other");
      if (change.field === "comments") jobs.push(handleComment(change.value));
    }
    for (const m of entry.messaging ?? []) {
      kinds.add(m.postback ? "postback" : m.message ? "message" : "other");
      jobs.push(handleMessaging(m));
    }
  }
  await Promise.all([...kinds].map(recordWebhook));
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("Handler error:", r.reason);

  // Always return 200, or Meta will retry and eventually disable the webhook
  return new Response("EVENT_RECEIVED", { status: 200 });
}

// APP_SECRET may hold one secret or several separated by commas
// (e.g. "instagramAppSecret,facebookAppSecret"); a match on any is accepted.
function isValidSignature(raw, header) {
  const secrets = (process.env.APP_SECRET ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!secrets.length) {
    console.error("APP_SECRET is not set: rejecting webhook POSTs until it is.");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;
  const a = Buffer.from(header);
  return secrets.some((secret, i) => {
    const b = Buffer.from("sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"));
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (ok && secrets.length > 1) console.log(`Signature matched APP_SECRET #${i + 1}`);
    return ok;
  });
}
