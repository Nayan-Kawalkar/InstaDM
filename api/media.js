// Your posts & reels (thumbnails, captions) for the dashboard's reel picker.
import { isAuthed, json, unauthorized } from "../lib/auth.js";
import { getMedia } from "../lib/instagram.js";

export async function GET(request) {
  if (!isAuthed(request)) return unauthorized();
  const after = new URL(request.url).searchParams.get("after") ?? undefined;
  const r = await getMedia({ after, limit: 30 });
  return json(r, r.ok ? 200 : 502);
}
