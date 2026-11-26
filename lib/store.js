// Persistent storage for automations, settings, stats and the activity log.
//
// Uses Upstash Redis over its REST API (free tier, no npm packages needed).
// Connect it in Vercel → Storage → Upstash (Redis) → Connect to project; Vercel
// then adds KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*) for you.
//
// Without those env vars it falls back to in-memory storage seeded from
// config.js — fine for local testing, but NOT saved between requests on Vercel.

import { rules as configRules, sendResourceIfFollowCheckFails } from "../config.js";
import { normalizeAutomation, fromLegacyRule } from "./automations.js";

const P = "instadm:";
const KEYS = {
  automations: P + "automations",
  settings: P + "settings",
  activity: P + "activity",
  stats: P + "stats",
};
const ACTIVITY_MAX = 200;

const redisUrl = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const redisToken = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const storageConfigured = () => Boolean(redisUrl() && redisToken());

async function redis(...command) {
  const res = await fetch(redisUrl(), {
    method: "POST",
    headers: { Authorization: `Bearer ${redisToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis ${command[0]} failed: ${data.error ?? res.status}`);
  return data.result;
}

// ---------- in-memory fallback ----------
const mem = (globalThis.__instadmMem ??= {
  kv: new Map(),
  lists: new Map(),
  hashes: new Map(),
});

function seedMemory() {
  if (mem.kv.has(KEYS.automations)) return;
  mem.kv.set(KEYS.automations, JSON.stringify(configRules.map(fromLegacyRule)));
  mem.kv.set(KEYS.settings, JSON.stringify({ sendResourceIfFollowCheckFails }));
}

async function getRaw(key) {
  if (storageConfigured()) return redis("GET", key);
  seedMemory();
  return mem.kv.get(key) ?? null;
}
async function setRaw(key, value) {
  if (storageConfigured()) return redis("SET", key, value);
  mem.kv.set(key, value);
}

// ---------- automations ----------
export async function getAutomations() {
  const raw = await getRaw(KEYS.automations);
  if (!raw) return [];
  try {
    return JSON.parse(raw).map(normalizeAutomation);
  } catch {
    return [];
  }
}

export async function saveAutomations(list) {
  await setRaw(KEYS.automations, JSON.stringify(list.map(normalizeAutomation)));
}

export async function upsertAutomation(input) {
  const list = await getAutomations();
  const now = new Date().toISOString();
  const a = normalizeAutomation({ ...input, updatedAt: now });
  const i = list.findIndex((x) => x.id === a.id);
  if (i >= 0) list[i] = { ...a, createdAt: list[i].createdAt ?? now };
  else list.push({ ...a, createdAt: now });
  await saveAutomations(list);
  return a;
}

export async function deleteAutomation(id) {
  const list = await getAutomations();
  await saveAutomations(list.filter((a) => a.id !== id));
}

// ---------- settings ----------
export const DEFAULT_SETTINGS = {
  paused: false, // master switch: true = bot ignores everything
  sendResourceIfFollowCheckFails: true,
};

export async function getSettings() {
  const raw = await getRaw(KEYS.settings);
  let s = {};
  try {
    s = raw ? JSON.parse(raw) : {};
  } catch {}
  return { ...DEFAULT_SETTINGS, ...s };
}

export async function saveSettings(input) {
  const s = { ...(await getSettings()) };
  for (const k of Object.keys(DEFAULT_SETTINGS)) if (k in input) s[k] = Boolean(input[k]);
  await setRaw(KEYS.settings, JSON.stringify(s));
  return s;
}

// ---------- stats (per automation counters) ----------
export async function incrStat(automationId, field) {
  const f = `${automationId}:${field}`;
  try {
    if (storageConfigured()) return await redis("HINCRBY", KEYS.stats, f, 1);
    const h = mem.hashes.get(KEYS.stats) ?? new Map();
    h.set(f, (h.get(f) ?? 0) + 1);
    mem.hashes.set(KEYS.stats, h);
  } catch (e) {
    console.error(e.message);
  }
}

// Returns { [automationId]: { comments, openers, followPrompts, delivered } }
export async function getStats() {
  let flat = [];
  if (storageConfigured()) flat = (await redis("HGETALL", KEYS.stats)) ?? [];
  else for (const [k, v] of mem.hashes.get(KEYS.stats) ?? []) flat.push(k, v);
  const out = {};
  for (let i = 0; i < flat.length; i += 2) {
    const [id, field] = String(flat[i]).split(":");
    (out[id] ??= {})[field] = Number(flat[i + 1]) || 0;
  }
  return out;
}

// ---------- activity log ----------
export async function logActivity(event) {
  const e = JSON.stringify({ t: new Date().toISOString(), ...event });
  try {
    if (storageConfigured()) {
      await redis("LPUSH", KEYS.activity, e);
      await redis("LTRIM", KEYS.activity, 0, ACTIVITY_MAX - 1);
    } else {
      const l = mem.lists.get(KEYS.activity) ?? [];
      l.unshift(e);
      mem.lists.set(KEYS.activity, l.slice(0, ACTIVITY_MAX));
    }
  } catch (err) {
    console.error(err.message);
  }
}

export async function getActivity(limit = 50) {
  const raw = storageConfigured()
    ? (await redis("LRANGE", KEYS.activity, 0, limit - 1)) ?? []
    : (mem.lists.get(KEYS.activity) ?? []).slice(0, limit);
  return raw.map((s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

export async function clearActivity() {
  if (storageConfigured()) await redis("DEL", KEYS.activity);
  else mem.lists.set(KEYS.activity, []);
}

// ---------- webhook heartbeat (no personal data) ----------
// kind: "comment" | "message" | "postback" | "other" | "bad_signature"
export async function recordWebhook(kind) {
  const key = P + "heartbeat";
  const now = new Date().toISOString();
  try {
    if (storageConfigured()) {
      await redis("HSET", key, `last_${kind}`, now, "last_any", now);
      await redis("HINCRBY", key, `count_${kind}`, 1);
    } else {
      const h = mem.hashes.get(key) ?? new Map();
      h.set(`last_${kind}`, now).set("last_any", now).set(`count_${kind}`, (h.get(`count_${kind}`) ?? 0) + 1);
      mem.hashes.set(key, h);
    }
  } catch (e) {
    console.error(e.message);
  }
}

export async function getHeartbeat() {
  const key = P + "heartbeat";
  const flat = storageConfigured() ? (await redis("HGETALL", key)) ?? [] : [...(mem.hashes.get(key) ?? [])].flat();
  const out = {};
  for (let i = 0; i < flat.length; i += 2) out[flat[i]] = /^count_/.test(flat[i]) ? Number(flat[i + 1]) : flat[i + 1];
  return out;
}

// ---------- de-duplication (Meta may deliver the same webhook twice) ----------
export async function claimOnce(id, ttlSeconds = 3 * 24 * 3600) {
  const key = P + "seen:" + id;
  try {
    if (storageConfigured()) return (await redis("SET", key, "1", "NX", "EX", ttlSeconds)) === "OK";
    if (mem.kv.has(key)) return false;
    mem.kv.set(key, "1");
    return true;
  } catch (e) {
    console.error(e.message);
    return true; // if storage hiccups, process rather than drop
  }
}
