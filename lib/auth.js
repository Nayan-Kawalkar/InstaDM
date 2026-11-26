// Dashboard login: one password (DASHBOARD_PASSWORD env var) → signed,
// HttpOnly session cookie valid for 7 days. No database needed.
import crypto from "node:crypto";

const COOKIE = "instadm_session";
const MAX_AGE = 7 * 24 * 3600;

const password = () => (process.env.DASHBOARD_PASSWORD ?? "").trim();
export const passwordConfigured = () => password().length > 0;

// Changing DASHBOARD_PASSWORD logs out every existing session.
const key = () => `${password()}|${process.env.APP_SECRET ?? ""}|instadm-session`;
const sign = (payload) => crypto.createHmac("sha256", key()).update(payload).digest("hex");

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function checkPassword(input) {
  if (!passwordConfigured()) return false;
  const h = (s) => crypto.createHash("sha256").update(String(s)).digest();
  return crypto.timingSafeEqual(h(input ?? ""), h(password()));
}

export function sessionCookie() {
  const exp = String(Date.now() + MAX_AGE * 1000);
  return `${COOKIE}=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAuthed(request) {
  if (!passwordConfigured()) return false;
  const cookies = Object.fromEntries(
    (request.headers.get("cookie") ?? "").split(";").map((c) => {
      const i = c.indexOf("=");
      return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
    })
  );
  const [exp, sig] = (cookies[COOKIE] ?? "").split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp));
}

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

export const unauthorized = () => json({ error: "Not logged in" }, 401);
