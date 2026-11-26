// Public, non-sensitive status: is the bot configured, and when did Instagram
// last deliver an event? Contains no usernames, comments or secrets.
import { getHeartbeat, storageConfigured, getSettings, getAutomations } from "../lib/store.js";

export async function GET() {
  const e = process.env;
  let heartbeat = {};
  let active = null;
  let paused = null;
  try {
    heartbeat = await getHeartbeat();
    active = (await getAutomations()).filter((a) => a.enabled).length;
    paused = (await getSettings()).paused;
  } catch (err) {
    heartbeat = { error: err.message };
  }
  return new Response(
    JSON.stringify({
      ok: true,
      configured: {
        verifyToken: Boolean(e.VERIFY_TOKEN),
        appSecret: Boolean(e.APP_SECRET),
        accessToken: Boolean(e.IG_ACCESS_TOKEN),
        igUserId: Boolean(e.IG_USER_ID),
        dashboardPassword: Boolean(e.DASHBOARD_PASSWORD),
        storage: storageConfigured(),
      },
      activeAutomations: active,
      paused,
      webhook: heartbeat,
      now: new Date().toISOString(),
    }),
    { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}
