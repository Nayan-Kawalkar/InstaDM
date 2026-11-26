// Dashboard data: automations, settings, stats, activity, account status.
import { isAuthed, json, unauthorized } from "../lib/auth.js";
import * as store from "../lib/store.js";
import { getAccount } from "../lib/instagram.js";

async function snapshot({ withAccount = false } = {}) {
  const [automations, settings, stats, activity, account] = await Promise.all([
    store.getAutomations(),
    store.getSettings(),
    store.getStats(),
    store.getActivity(100),
    withAccount ? getAccount() : null,
  ]);
  return {
    automations,
    settings,
    stats,
    activity,
    ...(withAccount ? { account } : {}),
    status: {
      storage: store.storageConfigured(),
      token: Boolean(process.env.IG_ACCESS_TOKEN),
      tokenType: (process.env.IG_ACCESS_TOKEN ?? "").startsWith("EAA") ? "facebook" : "instagram",
      userId: Boolean(process.env.IG_USER_ID),
      appSecret: Boolean(process.env.APP_SECRET),
      verifyToken: Boolean(process.env.VERIFY_TOKEN),
      webhookUrl: "/api/webhook",
    },
  };
}

export async function GET(request) {
  if (!isAuthed(request)) return unauthorized();
  try {
    return json(await snapshot({ withAccount: true }));
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}

// POST { action, ... }
export async function POST(request) {
  if (!isAuthed(request)) return unauthorized();
  const body = await request.json().catch(() => ({}));
  try {
    switch (body.action) {
      case "saveAutomation":
        await store.upsertAutomation(body.automation ?? {});
        break;
      case "deleteAutomation":
        await store.deleteAutomation(String(body.id ?? ""));
        break;
      case "toggleAutomation": {
        const list = await store.getAutomations();
        const a = list.find((x) => x.id === body.id);
        if (!a) return json({ error: "Automation not found" }, 404);
        a.enabled = Boolean(body.enabled);
        a.updatedAt = new Date().toISOString();
        await store.saveAutomations(list);
        break;
      }
      case "saveSettings":
        await store.saveSettings(body.settings ?? {});
        break;
      case "clearActivity":
        await store.clearActivity();
        break;
      default:
        return json({ error: "Unknown action" }, 400);
    }
    return json(await snapshot());
  } catch (e) {
    return json({ error: e.message }, 500);
  }
}
