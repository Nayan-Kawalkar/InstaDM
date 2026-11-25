// Local smoke test: simulates Meta's webhook calls against api/webhook.js
// with the Instagram API mocked out. Run: npm test
import crypto from "node:crypto";

process.env.VERIFY_TOKEN = "test-verify";
process.env.APP_SECRET = "test-secret";
process.env.IG_ACCESS_TOKEN = "test-token";
process.env.IG_USER_ID = "999";

// ---- Mock Instagram API ----
const calls = [];
const followers = new Set(); // user IDs that follow us
let profileApiBroken = false;
let buttonsRejected = false;

globalThis.fetch = async (url, opts = {}) => {
  const body = opts.body ? JSON.parse(opts.body) : undefined;
  calls.push({ url, method: opts.method, body });
  const json = (d, status = 200) => new Response(JSON.stringify(d), { status });

  if (opts.method === "GET") {
    if (profileApiBroken) return json({ error: { message: "boom" } }, 500);
    const id = new URL(url).pathname.split("/").pop();
    return json({ username: `user${id}`, is_user_follow_business: followers.has(id) });
  }
  if (buttonsRejected && body?.message?.attachment) return json({ error: { message: "no templates" } }, 400);
  return json({ id: "mock" });
};

const { GET, POST } = await import("../api/webhook.js");

let failed = 0;
const sent = () => calls.filter((c) => c.method === "POST");
const reset = () => (calls.length = 0);

const signedPost = (body, secret = "test-secret") => {
  const raw = JSON.stringify(body);
  const sig = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  return POST(new Request("http://x/api/webhook", { method: "POST", body: raw, headers: { "x-hub-signature-256": sig } }));
};
const comment = (value, secret) => signedPost({ entry: [{ changes: [{ field: "comments", value }] }] }, secret);
const tap = (senderId, payload) =>
  signedPost({ object: "instagram", entry: [{ messaging: [{ sender: { id: senderId }, recipient: { id: "999" }, postback: { payload, title: "x" } }] }] });
const dm = (senderId, text, extra = {}) =>
  signedPost({ object: "instagram", entry: [{ messaging: [{ sender: { id: senderId }, recipient: { id: "999" }, message: { mid: "m", text, ...extra } }] }] });

const quiet = console.log;
console.log = () => {}; // silence bot logs; PASS/FAIL use a saved reference
const out = (...a) => quiet(...a);
const checkQ = (name, ok) => { out(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; };

// ---- 1. Webhook verification ----
let res = await GET(new Request("http://x/api/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=abc"));
checkQ("GET verify returns challenge", res.status === 200 && (await res.text()) === "abc");
res = await GET(new Request("http://x/api/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc"));
checkQ("GET wrong token -> 403", res.status === 403);

// ---- 2. Comment -> opener DM with button + public reply ----
reset();
res = await comment({ id: "c1", text: "Send me the LINK", from: { id: "1", username: "friend" }, media: { id: "m1" } });
let s = sent();
checkQ("keyword comment -> 200", res.status === 200);
checkQ("opener is a private reply with a button", s[0]?.body.recipient.comment_id === "c1" && s[0].body.message.attachment.payload.buttons[0].payload === "GET:link");
checkQ("opener text has {username} filled", s[0]?.body.message.attachment.payload.text.includes("friend"));
checkQ("public reply posted", s[1]?.url.endsWith("/c1/replies"));

// ---- 3. Button tap, NOT following -> follow prompt ----
reset();
await tap("1", "GET:link");
s = sent();
checkQ("non-follower gets follow prompt (button), no resource", s.length === 1 && s[0].body.recipient.id === "1" && s[0].body.message.attachment.payload.buttons[0].title === "I followed ✅");

// ---- 4. Taps "I followed" after following -> resource ----
followers.add("1");
reset();
await tap("1", "GET:link");
s = sent();
checkQ("follower gets the resource", s.length === 1 && s[0].body.message.text.includes("https://example.com"));

// ---- 5. Rule without follow requirement ----
reset();
await tap("2", "GET:price");
s = sent();
checkQ("requireFollow:false sends resource to non-follower", s.length === 1 && s[0].body.message.text.includes("pricing"));

// ---- 6. Typed DM keyword triggers the same flow ----
reset();
await dm("3", "can i get the guide?");
s = sent();
checkQ("typed DM keyword -> follow prompt for non-follower", s.length === 1 && s[0].body.message.attachment);

// ---- 7. Ignored events ----
reset();
await comment({ id: "c2", text: "nice reel", from: { id: "1", username: "friend" }, media: { id: "m1" } });
await comment({ id: "c3", text: "link", from: { id: "999", username: "me" }, media: { id: "m1" } });
await comment({ id: "c4", text: "link", parent_id: "c1", from: { id: "1" }, media: { id: "m1" } });
await dm("999", "link");
await dm("1", "link", { is_echo: true });
await dm("4", "hello there");
checkQ("non-keyword / own / replies / echoes / chit-chat ignored", sent().length === 0);

// ---- 8. Failure handling ----
profileApiBroken = true;
reset();
await tap("5", "GET:link");
checkQ("follow check error -> resource sent (sendResourceIfFollowCheckFails)", sent()[0]?.body.message.text?.includes("https://example.com"));
profileApiBroken = false;

buttonsRejected = true;
reset();
await comment({ id: "c6", text: "link", from: { id: "6", username: "x" }, media: { id: "m1" } });
s = sent();
checkQ("button rejected -> text fallback opener", s[1]?.body.recipient.comment_id === "c6" && s[1].body.message.text.includes('Reply "link"'));
buttonsRejected = false;

reset();
res = await comment({ id: "c5", text: "link", from: { id: "1" } }, "bad-secret");
checkQ("bad signature -> 401, nothing sent", res.status === 401 && sent().length === 0);

console.log = quiet;
console.log(failed ? `\n${failed} failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
