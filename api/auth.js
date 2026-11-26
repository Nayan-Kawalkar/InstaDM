import {
  checkPassword,
  clearCookie,
  isAuthed,
  json,
  passwordConfigured,
  sessionCookie,
} from "../lib/auth.js";

// GET: am I logged in?
export async function GET(request) {
  return json({ authed: isAuthed(request), passwordConfigured: passwordConfigured() });
}

// POST { password }: log in
export async function POST(request) {
  if (!passwordConfigured()) {
    return json({ error: "DASHBOARD_PASSWORD is not set. Add it in Vercel → Settings → Environment Variables, then redeploy." }, 503);
  }
  const { password } = await request.json().catch(() => ({}));
  if (!checkPassword(password)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return json({ error: "Wrong password" }, 401);
  }
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie() });
}

// DELETE: log out
export async function DELETE() {
  return json({ ok: true }, 200, { "Set-Cookie": clearCookie() });
}
