// Thin wrappers around the Instagram Graph API (Instagram API with Instagram Login).

const GRAPH = "https://graph.instagram.com/v27.0";
const env = () => process.env;

async function call(method, path, body) {
  const res = await fetch(`${GRAPH}${path}`, {
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
  return { ok: res.ok, data };
}

const buttonMessage = (text, title, payload) => ({
  attachment: {
    type: "template",
    payload: {
      template_type: "button",
      text,
      buttons: [{ type: "postback", title, payload }],
    },
  },
});

// Private reply: a DM sent in response to a comment (one per comment, within 7 days).
export async function privateReplyWithButton(commentId, text, buttonTitle, payload, fallbackText) {
  const send = (message) =>
    call("POST", `/${env().IG_USER_ID}/messages`, {
      recipient: { comment_id: commentId },
      message,
    });

  let r = await send(buttonMessage(text, buttonTitle, payload));
  if (r.ok) return log("Opener DM", r);

  // If Instagram rejects the button, fall back to plain text asking the
  // person to reply with the keyword (a typed DM triggers the same flow).
  console.warn("Button DM failed, falling back to text:", JSON.stringify(r.data));
  r = await send({ text: fallbackText });
  return log("Opener DM (text fallback)", r);
}

export async function sendText(userId, text) {
  const r = await call("POST", `/${env().IG_USER_ID}/messages`, {
    recipient: { id: userId },
    message: { text },
  });
  return log("DM", r);
}

export async function sendButton(userId, text, buttonTitle, payload) {
  const r = await call("POST", `/${env().IG_USER_ID}/messages`, {
    recipient: { id: userId },
    message: buttonMessage(text, buttonTitle, payload),
  });
  return log("Button DM", r);
}

export async function replyToComment(commentId, message) {
  const r = await call("POST", `/${commentId}/replies`, { message });
  return log("Public reply", r);
}

// Returns { username, follows }: follows is true/false, or null if the check failed.
export async function getUserProfile(userId) {
  const r = await call("GET", `/${userId}?fields=username,is_user_follow_business`);
  if (!r.ok) {
    console.error("Profile lookup FAILED:", JSON.stringify(r.data));
    return { username: undefined, follows: null };
  }
  const f = r.data.is_user_follow_business;
  return { username: r.data.username, follows: typeof f === "boolean" ? f : null };
}

function log(label, r) {
  if (r.ok) console.log(`${label} OK:`, JSON.stringify(r.data));
  else console.error(`${label} FAILED:`, JSON.stringify(r.data));
  return r.ok;
}
