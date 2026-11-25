import crypto from "node:crypto";
import { handleComment, handleMessaging } from "../lib/bot.js";

// ---------- GET: Meta verifies your webhook URL once ----------
export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------- POST: Meta sends comments, DMs and button taps here ----------
export async function POST(request) {
  const raw = await request.text();

  if (!isValidSignature(raw, request.headers.get("x-hub-signature-256"))) {
    console.warn("Invalid or missing signature, ignoring request");
    return new Response("Invalid signature", { status: 401 });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }

  const jobs = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field === "comments") jobs.push(handleComment(change.value));
    }
    for (const m of entry.messaging ?? []) jobs.push(handleMessaging(m));
  }
  const results = await Promise.allSettled(jobs);
  for (const r of results) if (r.status === "rejected") console.error("Handler error:", r.reason);

  // Always return 200, or Meta will retry and eventually disable the webhook
  return new Response("EVENT_RECEIVED", { status: 200 });
}

function isValidSignature(raw, header) {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    console.error("APP_SECRET is not set: rejecting webhook POSTs until it is.");
    return false;
  }
  if (!header?.startsWith("sha256=")) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
