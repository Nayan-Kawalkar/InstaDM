// InstaDM dashboard — vanilla JS, no build step.

const $app = document.getElementById("app");
const LIMIT = { button: 20, text: 640, resources: 10, buttonsStyle: 3 };

const state = {
  authed: false,
  passwordConfigured: true,
  data: null, // { automations, settings, stats, activity, account, status }
  media: [],
  mediaAfter: null,
  mediaState: "idle", // idle | loading | done | error
  mediaError: "",
  view: viewFromHash(),
  editor: null, // { draft, isNew, errors, pickerFilter }
  autoFilter: "",
};

// ---------- utils ----------
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const fmtNum = (n) => new Intl.NumberFormat().format(n ?? 0);
const plural = (n, w) => `${fmtNum(n)} ${w}${n === 1 ? "" : "s"}`;
function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
const getPath = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
function setPath(o, p, v) {
  const ks = p.split(".");
  const last = ks.pop();
  ks.reduce((x, k) => (x[k] ??= {}), o)[last] = v;
}
const isUrl = (s) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(String(s).trim());

function viewFromHash() {
  const v = location.hash.replace("#", "");
  return ["overview", "automations", "reels", "activity", "settings"].includes(v) ? v : "overview";
}

function toast(msg, bad = false) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.textContent = msg;
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), bad ? 5000 : 2600);
}

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/api/auth") {
    state.authed = false;
    state.editor = null;
    render();
    throw new Error("Session expired, please log in again");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- data helpers ----------
const automations = () => state.data?.automations ?? [];
const mediaById = (id) => state.media.find((m) => m.id === id);
function appliesTo(a, mediaId) {
  if (a.scope === "all") return !a.excludeMediaIds.includes(mediaId);
  return a.mediaIds.includes(mediaId);
}
function autosForMedia(id) {
  return automations()
    .filter((a) => appliesTo(a, id))
    .sort((x, y) => (x.scope === "media" ? 0 : 1) - (y.scope === "media" ? 0 : 1));
}
const statOf = (id, k) => state.data?.stats?.[id]?.[k] ?? 0;
function totals() {
  const t = { comments: 0, openers: 0, followPrompts: 0, delivered: 0 };
  for (const s of Object.values(state.data?.stats ?? {})) for (const k in t) t[k] += s[k] ?? 0;
  return t;
}
function captionShort(m, n = 40) {
  const c = (m?.caption ?? "").replace(/\s+/g, " ").trim();
  return c ? (c.length > n ? c.slice(0, n - 1) + "…" : c) : "No caption";
}

async function loadData() {
  state.data = await api("/api/data");
}

async function loadMedia(more = false) {
  if (state.mediaState === "loading") return;
  state.mediaState = "loading";
  rerenderMediaAreas();
  try {
    const q = more && state.mediaAfter ? `?after=${encodeURIComponent(state.mediaAfter)}` : "";
    const r = await api("/api/media" + q);
    state.media = more ? [...state.media, ...r.items] : r.items;
    state.mediaAfter = r.after;
    state.mediaState = "done";
  } catch (e) {
    state.mediaState = "error";
    state.mediaError = e.message;
  }
  rerenderMediaAreas();
}

function rerenderMediaAreas() {
  if (state.editor) renderEditor();
  if (["reels", "automations", "overview"].includes(state.view)) renderMain();
}

// ---------- top-level render ----------
function render() {
  if (!state.authed) return renderLogin();
  if (!state.data) {
    $app.innerHTML = `<div class="boot">Loading dashboard…</div>`;
    return;
  }
  $app.innerHTML = `
    <div class="shell">
      <nav class="sidebar" aria-label="Main">${sidebarHtml()}</nav>
      <main class="main" id="main"></main>
    </div>
    <div id="editor-root"></div>`;
  renderMain();
  renderEditor();
}

function sidebarHtml() {
  const acc = state.data.account;
  const nav = [
    ["overview", "Overview", ""],
    ["automations", "Automations", automations().length],
    ["reels", "Reels & posts", ""],
    ["activity", "Activity", ""],
    ["settings", "Settings", ""],
  ];
  return `
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M3 5h18v11H10l-5 4v-4H3z"/></svg>
      </span>
      InstaDM
    </div>
    ${nav
      .map(
        ([id, label, count]) => `
      <button class="nav-item" data-act="nav" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ""}>
        ${label}${count !== "" ? `<span class="count">${count}</span>` : ""}
      </button>`
      )
      .join("")}
    <div class="sidebar-foot">
      ${
        state.data.settings.paused
          ? `<span class="badge warn"><span class="dot"></span>Bot paused</span>`
          : `<span class="badge ok"><span class="dot"></span>Bot running</span>`
      }
      <div class="mini-account">
        ${acc?.profile_picture_url ? `<img src="${esc(acc.profile_picture_url)}" alt="">` : `<span class="avatar-fallback"></span>`}
        <div class="who">
          <b>${acc?.ok ? "@" + esc(acc.username) : "Account"}</b>
          <span>${acc?.ok ? plural(acc.followers_count ?? 0, "follower") : "Not connected"}</span>
        </div>
      </div>
    </div>`;
}

function renderMain() {
  const main = document.getElementById("main");
  if (!main) return;
  const views = { overview: overviewHtml, automations: automationsHtml, reels: reelsHtml, activity: activityHtml, settings: settingsHtml };
  main.innerHTML = storageBanner() + views[state.view]();
}

function storageBanner() {
  const s = state.data.status;
  if (s.storage) return "";
  return `
    <div class="banner warn" role="note">
      <div>
        <b>Storage isn't connected, so changes won't be saved on Vercel.</b>
        Right now the bot uses the rules in <span class="mono">config.js</span>. Connect free Upstash Redis:
        Vercel → your project → <b>Storage</b> → <b>Create / Connect</b> → <b>Upstash (Redis)</b> → connect it to this project → redeploy.
      </div>
    </div>`;
}

function pageHead(title, sub, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div><div class="row">${actions}</div></div>`;
}

// ---------- overview ----------
function overviewHtml() {
  const t = totals();
  const active = automations().filter((a) => a.enabled).length;
  const s = state.data.status;
  const acc = state.data.account;
  const checks = [
    [acc?.ok, "Instagram account connected", acc?.ok ? `@${esc(acc.username)} · ${plural(acc.media_count ?? 0, "post")}` : esc(acc?.error ?? "Token or IG_USER_ID is wrong")],
    [s.appSecret && s.verifyToken, "Webhook secrets set", "APP_SECRET and VERIFY_TOKEN"],
    [s.storage, "Storage connected", s.storage ? "Upstash Redis" : "Changes won't persist. See the banner above"],
    [active > 0, "At least one automation is on", `${active} active`],
    [!state.data.settings.paused, "Bot is running", state.data.settings.paused ? "Paused in Settings" : "Replying to comments"],
  ];
  const recent = state.data.activity.slice(0, 6);
  return `
    ${pageHead("Overview", "How your auto-DMs are doing.", `<button class="btn primary" data-act="new">New automation</button>`)}
    <div class="stats">
      ${statTile("Comments matched", t.comments, "Triggered an automation")}
      ${statTile("Opening DMs sent", t.openers, "Message with a button")}
      ${statTile("Follow prompts", t.followPrompts, "Asked to follow first")}
      ${statTile("Resources delivered", t.delivered, "Links sent")}
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Setup</h2></div>
        <div class="card-pad">
          <ul class="checklist">
            ${checks
              .map(
                ([ok, title, sub]) => `<li><span class="ic ${ok ? "ok" : "bad"}" aria-hidden="true">${ok ? "✓" : "!"}</span>
                <div><b>${title}</b><div class="muted small">${sub}</div></div></li>`
              )
              .join("")}
          </ul>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>Recent activity</h2><button class="btn ghost sm" data-act="nav" data-view="activity">View all</button></div>
        ${recent.length ? activityTable(recent, true) : `<div class="empty small">Nothing yet. Activity appears here when someone comments a keyword.</div>`}
      </section>
    </div>`;
}

const statTile = (label, value, hint) =>
  `<div class="card stat"><div class="label">${label}</div><div class="value">${fmtNum(value)}</div><div class="hint">${hint}</div></div>`;

// ---------- automations ----------
function automationsHtml() {
  const q = state.autoFilter.toLowerCase();
  const list = automations().filter(
    (a) => !q || a.name.toLowerCase().includes(q) || a.trigger.keywords.some((k) => k.includes(q))
  );
  return `
    ${pageHead("Automations", "Each automation decides which reels it watches, what triggers it, and what it sends.",
      `<input type="search" placeholder="Search name or keyword" aria-label="Search automations" data-act="filter" value="${esc(state.autoFilter)}" style="width:220px">
       <button class="btn primary" data-act="new">New automation</button>`)}
    <section class="card">
      ${
        list.length
          ? `<div class="auto-list">${list.map(autoRowHtml).join("")}</div>`
          : automations().length
            ? `<div class="empty">No automation matches “${esc(state.autoFilter)}”.</div>`
            : `<div class="empty"><h3>No automations yet</h3><p>Create one, or go to <b>Reels & posts</b> and add an auto-DM to a specific reel.</p>
               <button class="btn primary" data-act="new">New automation</button></div>`
      }
    </section>`;
}

function scopeSummary(a) {
  if (a.scope === "all") {
    return a.excludeMediaIds.length ? `All posts except ${a.excludeMediaIds.length}` : "All posts & reels";
  }
  return a.mediaIds.length === 1 ? "1 reel" : `${a.mediaIds.length} reels`;
}

function thumbsHtml(ids) {
  const shown = ids.slice(0, 4);
  if (!shown.length) return "";
  return `<span class="thumbs" aria-hidden="true">${shown
    .map((id) => {
      const m = mediaById(id);
      return m?.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy">` : `<span class="ph"></span>`;
    })
    .join("")}</span>`;
}

function autoRowHtml(a) {
  const trig = a.trigger.anyComment && !a.trigger.keywords.length
    ? `<span class="badge">Any comment</span>`
    : a.trigger.keywords.slice(0, 4).map((k) => `<span class="badge accent">${esc(k)}</span>`).join("") +
      (a.trigger.keywords.length > 4 ? `<span class="badge">+${a.trigger.keywords.length - 4}</span>` : "");
  return `
    <div class="auto-row">
      <label class="switch" title="${a.enabled ? "On" : "Off"}">
        <input type="checkbox" data-act="toggle" data-id="${a.id}" ${a.enabled ? "checked" : ""} aria-label="Turn ${esc(a.name)} ${a.enabled ? "off" : "on"}">
        <span class="track"></span>
      </label>
      <div style="min-width:0">
        <h3>${esc(a.name)}</h3>
        <div class="meta">
          <span class="badge">${thumbsHtml(a.scope === "media" ? a.mediaIds : [])}${scopeSummary(a)}</span>
          ${trig}
          ${a.requireFollow ? `<span class="badge warn">Followers only</span>` : ""}
          <span class="badge">${a.delivery.resources.length ? plural(a.delivery.resources.length, "resource") : "Message only"}</span>
        </div>
      </div>
      <div class="nums">
        <div><b>${fmtNum(statOf(a.id, "comments"))}</b>comments</div>
        <div><b>${fmtNum(statOf(a.id, "delivered"))}</b>delivered</div>
      </div>
      <div class="row">
        <button class="btn sm" data-act="edit" data-id="${a.id}">Edit</button>
        <button class="btn ghost sm" data-act="duplicate" data-id="${a.id}" title="Duplicate">Duplicate</button>
        <button class="btn ghost sm danger" data-act="delete" data-id="${a.id}">Delete</button>
      </div>
    </div>`;
}

// ---------- reels ----------
function reelsHtml() {
  const head = pageHead("Reels & posts", "Pick a reel to give it its own auto-DM and resources. Reels without one are left alone.",
    `<button class="btn" data-act="reload-media">Refresh</button>`);
  if (state.mediaState === "error") return head + `<div class="banner bad"><div><b>Couldn't load your posts</b>${esc(state.mediaError)}</div></div>`;
  if (!state.media.length && state.mediaState !== "done") return head + `<div class="empty">Loading your reels…</div>`;
  if (!state.media.length) return head + `<div class="empty"><h3>No posts found</h3><p>Post a reel on Instagram, then refresh.</p></div>`;
  return `${head}
    <div class="reel-grid">${state.media.map(reelCardHtml).join("")}</div>
    ${state.mediaAfter ? `<div class="row" style="justify-content:center;margin-top:20px"><button class="btn" data-act="more-media" ${state.mediaState === "loading" ? "disabled" : ""}>${state.mediaState === "loading" ? "Loading…" : "Load more"}</button></div>` : ""}`;
}

function reelCardHtml(m) {
  const autos = autosForMedia(m.id);
  const own = autos.find((a) => a.scope === "media");
  const active = autos.find((a) => a.enabled);
  const status = !autos.length
    ? `<span class="badge">No auto-DM</span>`
    : active
      ? `<span class="badge ok"><span class="dot"></span>${esc(active.name)}</span>`
      : `<span class="badge warn">${esc(autos[0].name)} (off)</span>`;
  return `
    <article class="card reel">
      <div class="media" style="${m.thumb ? `background-image:url('${esc(m.thumb)}')` : ""}">
        <span class="type">${esc(m.type === "REEL" ? "Reel" : m.type === "CAROUSEL_ALBUM" ? "Carousel" : m.type === "VIDEO" ? "Video" : "Photo")}</span>
        <div class="status">${status}</div>
      </div>
      <div class="body">
        <div class="cap">${esc(captionShort(m, 120))}</div>
        <div class="muted small">${timeAgo(m.timestamp)} · ${plural(m.comments, "comment")}</div>
        <div class="foot">
          ${own
            ? `<button class="btn sm" data-act="edit" data-id="${own.id}">Edit auto-DM</button>`
            : `<button class="btn sm primary" data-act="new-for" data-media="${m.id}">Add auto-DM</button>`}
          <a class="btn ghost sm" href="${esc(m.permalink)}" target="_blank" rel="noopener" aria-label="Open on Instagram">Open ↗</a>
        </div>
      </div>
    </article>`;
}

// ---------- activity ----------
const ACT = {
  opener: ["Opening DM sent", ""],
  follow_prompt: ["Asked to follow", "warn"],
  delivered: ["Resources delivered", "ok"],
  public_reply: ["Public reply", ""],
};

function activityTable(rows, compact = false) {
  return `<div class="table-wrap"><table>
    <thead><tr><th>When</th><th>Event</th><th>Person</th>${compact ? "" : "<th>Automation</th><th>Details</th>"}</tr></thead>
    <tbody>${rows
      .map((e) => {
        const [label, tone] = ACT[e.type] ?? [e.type, ""];
        return `<tr>
          <td class="muted small" title="${esc(new Date(e.t).toLocaleString())}">${timeAgo(e.t)}</td>
          <td>${e.ok === false ? `<span class="badge bad">${esc(label)} failed</span>` : `<span class="badge ${tone}">${esc(label)}</span>`}</td>
          <td>${e.user ? "@" + esc(e.user) : "—"}</td>
          ${compact ? "" : `<td>${esc(e.automation ?? "")}</td>
          <td class="small ${e.ok === false ? "" : "muted"}">${e.ok === false ? esc(e.error ?? "Unknown error") : e.text ? `“${esc(e.text)}”` : ""}</td>`}
        </tr>`;
      })
      .join("")}</tbody></table></div>`;
}

function activityHtml() {
  const rows = state.data.activity;
  return `
    ${pageHead("Activity", "The last 100 things the bot did. Failures show Instagram's error message.",
      `<button class="btn" data-act="refresh">Refresh</button>${rows.length ? `<button class="btn ghost danger" data-act="clear-activity">Clear</button>` : ""}`)}
    <section class="card">${rows.length ? activityTable(rows) : `<div class="empty"><h3>No activity yet</h3><p>Comment a keyword on one of your reels from a tester account to try it.</p></div>`}</section>`;
}

// ---------- settings ----------
function settingsHtml() {
  const st = state.data.settings;
  const s = state.data.status;
  const webhook = location.origin + "/api/webhook";
  return `
    ${pageHead("Settings", "Global switches and connection details.")}
    <div class="stack" style="max-width:760px">
      <section class="card card-pad stack">
        <h2>Bot</h2>
        ${switchRow("paused", !st.paused, "Bot is running", "Turn off to pause every automation at once. Comments that arrive while paused are ignored.", true)}
        ${switchRow("sendResourceIfFollowCheckFails", st.sendResourceIfFollowCheckFails, "Send resources if the follow check errors", "Rarely, Instagram's follow check itself fails. On: send the resources anyway. Off: ask them to follow again.")}
      </section>
      <section class="card card-pad stack">
        <h2>Connection</h2>
        <ul class="checklist">
          ${connRow(s.token, "Access token", s.token ? (s.tokenType === "facebook" ? "Unified/Facebook login token (EAA…)" : "Instagram login token (IGAA…)") : "IG_ACCESS_TOKEN is missing")}
          ${connRow(s.userId, "Instagram account ID", s.userId ? "IG_USER_ID is set" : "IG_USER_ID is missing")}
          ${connRow(s.appSecret, "App secret", s.appSecret ? "Webhook signatures are checked" : "APP_SECRET is missing: webhooks are rejected")}
          ${connRow(s.verifyToken, "Verify token", s.verifyToken ? "VERIFY_TOKEN is set" : "VERIFY_TOKEN is missing")}
          ${connRow(s.storage, "Storage", s.storage ? "Upstash Redis connected" : "Not connected: dashboard changes are not saved", !s.storage)}
        </ul>
        <label class="field"><span>Webhook callback URL <span class="help">paste this into Meta → Configure webhooks</span></span>
          <div class="row"><input type="text" readonly value="${esc(webhook)}" class="mono grow" aria-label="Webhook URL"><button class="btn" data-act="copy" data-text="${esc(webhook)}">Copy</button></div>
        </label>
        <p class="muted small" style="margin:0">Tokens and secrets live in Vercel → Settings → Environment Variables. The access token expires about every 60 days, so set a reminder to regenerate it.</p>
      </section>
      <section class="card card-pad row">
        <div class="grow"><h2>Session</h2><div class="muted small">You stay logged in for 7 days on this browser.</div></div>
        <button class="btn" data-act="logout">Log out</button>
      </section>
    </div>`;
}

function switchRow(key, checked, title, help, invert = false) {
  return `<div class="row" style="align-items:flex-start;flex-wrap:nowrap">
    <div class="grow"><b>${title}</b><div class="muted small">${help}</div></div>
    <label class="switch"><input type="checkbox" data-act="setting" data-key="${key}" ${invert ? 'data-invert="1"' : ""} ${checked ? "checked" : ""} aria-label="${esc(title)}"><span class="track"></span></label>
  </div>`;
}
const connRow = (ok, title, sub, warnOnly = false) =>
  `<li><span class="ic ${ok ? "ok" : warnOnly ? "warn" : "bad"}" aria-hidden="true">${ok ? "✓" : "!"}</span><div><b>${title}</b><div class="muted small">${sub}</div></div></li>`;

// ---------- login ----------
function renderLogin() {
  $app.innerHTML = `
    <div class="login">
      <form class="card" id="login-form">
        <span class="brand-mark" aria-hidden="true" style="width:40px;height:40px;border-radius:11px">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M3 5h18v11H10l-5 4v-4H3z"/></svg>
        </span>
        <h1>InstaDM dashboard</h1>
        <p class="muted" style="margin:0 0 18px">Manage your reel auto-DMs.</p>
        ${
          state.passwordConfigured
            ? `<label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
               <p class="errors" id="login-error" hidden style="margin-top:12px;list-style:none;padding-left:14px"></p>
               <button class="btn primary" style="width:100%;margin-top:16px" type="submit">Log in</button>`
            : `<div class="banner warn" style="margin:0"><div><b>Set a dashboard password first</b>
               Add <span class="mono">DASHBOARD_PASSWORD</span> in Vercel → Settings → Environment Variables, then redeploy.</div></div>`
        }
      </form>
    </div>`;
}

// ---------- editor ----------
function blankAutomation(mediaIds = []) {
  const m = mediaIds.length === 1 ? mediaById(mediaIds[0]) : null;
  return {
    id: null,
    name: m ? `Reel: ${captionShort(m, 32)}` : "",
    enabled: true,
    scope: "media",
    mediaIds,
    excludeMediaIds: [],
    trigger: { anyComment: false, keywords: ["link"], matchMode: "contains", dmKeywords: true },
    publicReplies: ["Sent you a DM! 📩", "Check your DMs 🙌"],
    opener: { enabled: true, text: "Hey {username}! 👋 Thanks for commenting. Tap below and I'll send it over.", button: "Send me the link" },
    requireFollow: true,
    followPrompt: { text: "Almost there! 🙌 This is just for my followers. Follow my account, then tap the button below.", button: "I followed ✅" },
    delivery: { message: "Here you go 🎉", resources: [{ title: "", url: "" }], style: "buttons" },
  };
}

function openEditor(draft, isNew) {
  if (!draft.delivery.resources.length) draft.delivery.resources.push({ title: "", url: "" });
  state.editor = { draft, isNew, errors: [], pickerFilter: "", keywordInput: "" };
  renderEditor();
  if (state.mediaState === "idle") loadMedia();
  document.querySelector("#editor-root [data-bind='name']")?.focus();
}

function closeEditor() {
  state.editor = null;
  renderEditor();
}

function counter(value, max) {
  const n = (value ?? "").length;
  return `<div class="counter ${n > max ? "over" : ""}">${n}/${max}</div>`;
}

function editorHtml() {
  const { draft: d, isNew, errors } = state.editor;
  const followForcesOpener = d.requireFollow;
  return `
  <div class="overlay" data-act="overlay">
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="ed-title">
      <div class="drawer-head">
        <h2 id="ed-title" class="grow">${isNew ? "New automation" : "Edit automation"}</h2>
        <label class="switch"><input type="checkbox" data-bind="enabled" ${d.enabled ? "checked" : ""}><span class="track"></span><span>${d.enabled ? "On" : "Off"}</span></label>
        <button class="btn ghost icon-btn" data-act="close" aria-label="Close">✕</button>
      </div>
      <div class="drawer-body">
        <div class="stack">
          ${errors.length ? `<ul class="errors" role="alert">${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}
          <section class="card section">
            <label class="field"><span>Name <span class="help">only you see this</span></span>
              <input type="text" data-bind="name" value="${esc(d.name)}" placeholder="e.g. Free Figma kit reel" maxlength="80"></label>
          </section>

          <section class="card section">
            <div class="section-title"><span class="n">1</span><div><h3>Which reels?</h3><p>Reel-specific automations take priority over “all posts” ones.</p></div></div>
            <div class="segmented" role="group" aria-label="Scope">
              <button data-act="scope" data-v="media" aria-pressed="${d.scope === "media"}">Specific reels</button>
              <button data-act="scope" data-v="all" aria-pressed="${d.scope === "all"}">All posts & reels</button>
            </div>
            <p class="muted small" style="margin:0">${
              d.scope === "media"
                ? `Selected: <b>${d.mediaIds.length}</b>. Tap reels to select them.`
                : `Runs on every post. Tap reels to <b>exclude</b> them (${d.excludeMediaIds.length} excluded).`
            }</p>
            ${pickerHtml()}
          </section>

          <section class="card section">
            <div class="section-title"><span class="n">2</span><div><h3>Trigger</h3><p>What the comment has to contain. Not case-sensitive.</p></div></div>
            <div class="field"><span>Keywords <span class="help">press Enter or comma to add</span></span>
              <div class="chips" data-act="focus-chips">
                ${d.trigger.keywords.map((k, i) => `<span class="chip">${esc(k)}<button data-act="rm-kw" data-i="${i}" aria-label="Remove ${esc(k)}">×</button></span>`).join("")}
                <input type="text" id="kw-input" data-act="kw-input" value="${esc(state.editor.keywordInput)}" placeholder="${d.trigger.keywords.length ? "Add another…" : "e.g. link, guide, free"}" aria-label="Add keyword">
              </div>
            </div>
            <div class="input-row">
              <label class="check"><input type="checkbox" data-bind="trigger.anyComment" ${d.trigger.anyComment ? "checked" : ""}>
                <span><b>Reply to every comment</b><br><span class="muted small">Even without a keyword (keywords still win if set).</span></span></label>
              <label class="field"><span>Match</span>
                <select data-bind="trigger.matchMode">
                  <option value="contains" ${d.trigger.matchMode === "contains" ? "selected" : ""}>Contains the keyword</option>
                  <option value="word" ${d.trigger.matchMode === "word" ? "selected" : ""}>Whole word only</option>
                </select></label>
            </div>
            <label class="check"><input type="checkbox" data-bind="trigger.dmKeywords" ${d.trigger.dmKeywords ? "checked" : ""}>
              <span><b>Also trigger when someone DMs the keyword</b><br><span class="muted small">Useful if they message you instead of commenting.</span></span></label>
          </section>

          <section class="card section">
            <div class="section-title"><span class="n">3</span><div><h3>Public reply under the comment</h3><p>One per line; a random one is used each time so replies don't look spammy. Leave empty for no public reply.</p></div></div>
            <textarea data-bind="publicRepliesText" rows="3" placeholder="Sent you a DM! 📩">${esc(d.publicReplies.join("\n"))}</textarea>
          </section>

          <section class="card section ${!d.opener.enabled && !followForcesOpener ? "disabled" : ""}">
            <div class="section-title"><span class="n">4</span><div class="grow"><h3>Opening DM with a button</h3><p>Sent as a private reply to the comment.</p></div>
              <label class="switch"><input type="checkbox" data-bind="opener.enabled" ${d.opener.enabled || followForcesOpener ? "checked" : ""} ${followForcesOpener ? "disabled" : ""} aria-label="Send opening DM"><span class="track"></span></label></div>
            ${followForcesOpener ? `<p class="muted small" style="margin:0">Required when “Followers only” is on: Instagram only allows the follow check after they tap a button.</p>` : !d.opener.enabled ? `<p class="muted small" style="margin:0">Off: the resources are sent straight away as the private reply.</p>` : ""}
            <div class="fields stack">
              <label class="field"><span>Message <span class="help">{username} is replaced with their handle</span></span>
                <textarea data-bind="opener.text" rows="3">${esc(d.opener.text)}</textarea>${counter(d.opener.text, LIMIT.text)}</label>
              <label class="field"><span>Button text</span>
                <input type="text" data-bind="opener.button" value="${esc(d.opener.button)}" placeholder="Send me the link">${counter(d.opener.button, LIMIT.button)}</label>
            </div>
          </section>

          <section class="card section ${d.requireFollow ? "" : "disabled"}">
            <div class="section-title"><span class="n">5</span><div class="grow"><h3>Followers only</h3><p>Check if they follow you before sending. If not, ask them to follow first.</p></div>
              <label class="switch"><input type="checkbox" data-bind="requireFollow" ${d.requireFollow ? "checked" : ""} aria-label="Followers only"><span class="track"></span></label></div>
            <div class="fields stack">
              <label class="field"><span>“Please follow” message</span>
                <textarea data-bind="followPrompt.text" rows="3">${esc(d.followPrompt.text)}</textarea>${counter(d.followPrompt.text, LIMIT.text)}</label>
              <label class="field"><span>Button text <span class="help">tapping it re-checks the follow</span></span>
                <input type="text" data-bind="followPrompt.button" value="${esc(d.followPrompt.button)}">${counter(d.followPrompt.button, LIMIT.button)}</label>
            </div>
          </section>

          <section class="card section">
            <div class="section-title"><span class="n">6</span><div><h3>What they get</h3><p>The message and the resources for this automation.</p></div></div>
            <label class="field"><span>Message</span>
              <textarea data-bind="delivery.message" rows="3" placeholder="Here you go 🎉">${esc(d.delivery.message)}</textarea>${counter(d.delivery.message, LIMIT.text)}</label>
            <div class="field"><span>Resources <span class="help">links: PDFs, Drive, Notion, YouTube, your site…</span></span>
              <div class="stack" style="gap:8px">
                ${d.delivery.resources.map((r, i) => `
                  <div class="res-row">
                    <input type="text" data-bind="delivery.resources.${i}.title" value="${esc(r.title)}" placeholder="Button / title" maxlength="80" aria-label="Resource ${i + 1} title">
                    <input type="url" data-bind="delivery.resources.${i}.url" value="${esc(r.url)}" placeholder="https://…" aria-label="Resource ${i + 1} link">
                    <button class="btn ghost icon-btn" data-act="rm-res" data-i="${i}" aria-label="Remove resource ${i + 1}">✕</button>
                  </div>`).join("")}
                <div><button class="btn sm" data-act="add-res" ${d.delivery.resources.length >= LIMIT.resources ? "disabled" : ""}>+ Add resource</button>
                <span class="muted small">&nbsp;Leave empty to send just the message.</span></div>
              </div>
            </div>
            <div class="field"><span>Send resources as</span>
              <div class="segmented" role="group" aria-label="Delivery style">
                <button data-act="style" data-v="buttons" aria-pressed="${d.delivery.style === "buttons"}">Link buttons</button>
                <button data-act="style" data-v="text" aria-pressed="${d.delivery.style === "text"}">Text with links</button>
              </div>
              <span class="help">Buttons work for 1–3 resources (button text max 20 characters). With more, links are sent as text automatically.</span>
            </div>
          </section>
        </div>
        <aside class="preview" aria-label="Preview">${previewHtml()}</aside>
      </div>
      <div class="drawer-foot">
        ${!isNew ? `<button class="btn ghost danger" data-act="delete" data-id="${d.id}">Delete</button><span class="grow"></span>` : ""}
        <button class="btn" data-act="close">Cancel</button>
        <button class="btn primary" data-act="save">${isNew ? "Create automation" : "Save changes"}</button>
      </div>
    </div>
  </div>`;
}

function pickerHtml() {
  const { draft: d } = state.editor;
  if (state.mediaState === "error") return `<div class="banner bad" style="margin:0"><div><b>Couldn't load reels</b>${esc(state.mediaError)}</div></div>`;
  if (!state.media.length) return `<div class="muted small">${state.mediaState === "done" ? "No posts found." : "Loading your reels…"}</div>`;
  const selected = d.scope === "media" ? d.mediaIds : d.excludeMediaIds;
  return `
    <div class="picker">${state.media
      .map((m) => {
        const on = selected.includes(m.id);
        const other = automations().find((a) => a.id !== d.id && a.scope === "media" && a.mediaIds.includes(m.id));
        return `<button class="pick ${d.scope === "all" ? "excluded" : ""}" data-act="pick" data-media="${m.id}" aria-pressed="${on}" title="${esc(captionShort(m, 80))}">
          <div class="img" style="${m.thumb ? `background-image:url('${esc(m.thumb)}')` : ""}"></div>
          <span class="tick" aria-hidden="true">${on ? (d.scope === "all" ? "–" : "✓") : ""}</span>
          ${other ? `<span class="taken">${esc(other.name)}</span>` : ""}
        </button>`;
      })
      .join("")}</div>
    ${state.mediaAfter ? `<div><button class="btn sm" data-act="more-media" ${state.mediaState === "loading" ? "disabled" : ""}>${state.mediaState === "loading" ? "Loading…" : "Load more reels"}</button></div>` : ""}`;
}

function previewHtml() {
  const d = state.editor.draft;
  const user = "friend";
  const fill = (t) => esc((t ?? "").replaceAll("{username}", user));
  const kw = d.trigger.keywords[0] ?? (d.trigger.anyComment ? "🔥🔥" : "…");
  const res = d.delivery.resources.filter((r) => r.url.trim());
  const opener = d.opener.enabled || d.requireFollow;
  const asButtons = d.delivery.style === "buttons" && res.length >= 1 && res.length <= 3;
  const deliveryBubble = asButtons
    ? `<div class="bubble in card-msg"><div class="txt">${fill(d.delivery.message || "Here you go 👇")}</div>${res.map((r) => `<span class="b">${esc(r.title || "Open link")}</span>`).join("")}</div>`
    : `<div class="bubble in">${[fill(d.delivery.message), ...res.map((r) => (r.title ? `🔗 ${esc(r.title)}\n${esc(r.url)}` : esc(r.url)))].filter(Boolean).join("\n\n") || "🙌"}</div>`;
  return `
    <div class="phone">
      <div class="phone-top">${state.data.account?.profile_picture_url ? `<img src="${esc(state.data.account.profile_picture_url)}" alt="" style="width:24px;height:24px;border-radius:50%">` : ""}
        ${state.data.account?.ok ? "@" + esc(state.data.account.username) : "Your account"}<span class="grow"></span><span class="muted small">Preview</span></div>
      <div class="phone-body">
        <span class="step-label">On the reel</span>
        <div class="comment-preview"><span class="avatar-fallback"></span><div><b>${user}</b> ${esc(kw)}
          ${d.publicReplies.length ? `<div class="reply"><b>you</b> ${fill(d.publicReplies[0])}</div>` : ""}</div></div>
        <span class="step-label">In their DMs</span>
        ${opener ? `<div class="bubble in card-msg"><div class="txt">${fill(d.opener.text || "Tap below 👇")}</div><span class="b">${esc(d.opener.button || "Send it")}</span></div>
          <div class="bubble out">${esc(d.opener.button || "Send it")}</div>` : ""}
        ${d.requireFollow ? `<span class="step-label">If not following</span>
          <div class="bubble in card-msg"><div class="txt">${fill(d.followPrompt.text || "Please follow me first 🙌")}</div><span class="b">${esc(d.followPrompt.button || "I followed ✅")}</span></div>
          <div class="bubble out">${esc(d.followPrompt.button || "I followed ✅")}</div>
          <span class="step-label">Once following</span>` : ""}
        ${deliveryBubble}
      </div>
    </div>`;
}

function renderEditor() {
  const root = document.getElementById("editor-root");
  if (!root) return;
  if (!state.editor) {
    root.innerHTML = "";
    document.body.style.overflow = "";
    return;
  }
  const active = document.activeElement;
  const activeBind = active?.dataset?.bind ?? (active?.id === "kw-input" ? "#kw" : null);
  const scroll = root.querySelector(".drawer-body")?.scrollTop ?? 0;
  root.innerHTML = editorHtml();
  document.body.style.overflow = "hidden";
  root.querySelector(".drawer-body").scrollTop = scroll;
  if (activeBind) {
    const el = activeBind === "#kw" ? root.querySelector("#kw-input") : root.querySelector(`[data-bind="${activeBind}"]`);
    if (el) {
      el.focus();
      if (el.setSelectionRange && typeof el.value === "string" && el.type !== "url") el.setSelectionRange(el.value.length, el.value.length);
    }
  }
}

// Update only the preview and counters while typing (keeps focus & cursor).
function refreshEditorLive(target) {
  const root = document.getElementById("editor-root");
  root.querySelector(".preview").innerHTML = previewHtml();
  const c = target?.parentElement?.querySelector(".counter");
  if (c) {
    const max = target.tagName === "TEXTAREA" ? LIMIT.text : LIMIT.button;
    c.outerHTML = counter(target.value, max);
  }
}

function addKeywords(raw) {
  const d = state.editor.draft;
  const parts = raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  for (const p of parts) if (!d.trigger.keywords.includes(p)) d.trigger.keywords.push(p);
  state.editor.keywordInput = "";
}

function validate(d) {
  const e = [];
  if (!d.name.trim()) e.push("Give the automation a name.");
  if (d.scope === "media" && !d.mediaIds.length) e.push("Select at least one reel, or switch to “All posts & reels”.");
  if (!d.trigger.keywords.length && !d.trigger.anyComment) e.push("Add a keyword, or turn on “Reply to every comment”.");
  const opener = d.opener.enabled || d.requireFollow;
  if (opener && !d.opener.text.trim()) e.push("Write the opening DM message.");
  if (opener && !d.opener.button.trim()) e.push("Add the opening DM button text.");
  if (d.opener.button.length > LIMIT.button) e.push(`Opening button text must be ${LIMIT.button} characters or fewer.`);
  if (d.requireFollow && !d.followPrompt.text.trim()) e.push("Write the “please follow” message.");
  if (d.requireFollow && !d.followPrompt.button.trim()) e.push("Add the “please follow” button text.");
  if (d.followPrompt.button.length > LIMIT.button) e.push(`Follow button text must be ${LIMIT.button} characters or fewer.`);
  for (const t of [d.opener.text, d.followPrompt.text, d.delivery.message]) if (t.length > LIMIT.text) { e.push(`Messages must be ${LIMIT.text} characters or fewer.`); break; }
  const res = d.delivery.resources.filter((r) => r.url.trim() || r.title.trim());
  res.forEach((r, i) => { if (!isUrl(r.url)) e.push(`Resource ${i + 1}: enter a full link starting with https://`); });
  if (!d.delivery.message.trim() && !res.length) e.push("Add a message or at least one resource to send.");
  if (d.delivery.style === "buttons" && res.length <= 3 && res.some((r) => (r.title || "Open link").length > LIMIT.button))
    e.push(`With link buttons, resource titles must be ${LIMIT.button} characters or fewer.`);
  return e;
}

function cleanedDraft(d) {
  const out = clone(d);
  out.delivery.resources = out.delivery.resources.filter((r) => r.url.trim()).map((r) => ({ title: r.title.trim(), url: r.url.trim() }));
  if (out.scope === "media") out.excludeMediaIds = [];
  else out.mediaIds = [];
  if (!out.id) delete out.id;
  return out;
}

async function saveEditor() {
  const ed = state.editor;
  const pending = ed.keywordInput.trim();
  if (pending) addKeywords(pending);
  ed.errors = validate(ed.draft);
  if (ed.errors.length) {
    renderEditor();
    document.querySelector("#editor-root .drawer-body").scrollTop = 0;
    return;
  }
  const btn = document.querySelector('#editor-root [data-act="save"]');
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const data = await api("/api/data", { method: "POST", body: { action: "saveAutomation", automation: cleanedDraft(ed.draft) } });
    Object.assign(state.data, data);
    state.editor = null;
    render();
    toast(ed.isNew ? "Automation created" : "Changes saved");
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = ed.isNew ? "Create automation" : "Save changes";
  }
}

// ---------- actions ----------
async function mutate(body, okMsg) {
  try {
    const data = await api("/api/data", { method: "POST", body });
    Object.assign(state.data, data);
    render();
    if (okMsg) toast(okMsg);
  } catch (e) {
    toast(e.message, true);
    render();
  }
}

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const ed = state.editor;

  if (act === "overlay") {
    if (ev.target === el) closeEditor();
    return;
  }
  if (["toggle", "setting", "filter", "kw-input"].includes(act)) return; // handled by change/input

  switch (act) {
    case "nav":
      location.hash = el.dataset.view;
      return;
    case "new":
      return openEditor(blankAutomation(), true);
    case "new-for":
      return openEditor(blankAutomation([el.dataset.media]), true);
    case "edit": {
      const a = automations().find((x) => x.id === el.dataset.id);
      if (a) openEditor(clone(a), false);
      return;
    }
    case "duplicate": {
      const a = clone(automations().find((x) => x.id === el.dataset.id));
      a.id = null;
      a.name = `${a.name} (copy)`;
      a.enabled = false;
      return openEditor(a, true);
    }
    case "delete": {
      const a = automations().find((x) => x.id === el.dataset.id);
      if (!a || !confirm(`Delete “${a.name}”? This can't be undone.`)) return;
      state.editor = null;
      return mutate({ action: "deleteAutomation", id: a.id }, "Automation deleted");
    }
    case "refresh":
      try { await loadData(); render(); toast("Updated"); } catch (e) { toast(e.message, true); }
      return;
    case "reload-media":
      state.media = [];
      state.mediaAfter = null;
      state.mediaState = "idle";
      return loadMedia();
    case "more-media":
      return loadMedia(true);
    case "clear-activity":
      if (confirm("Clear the activity log?")) mutate({ action: "clearActivity" }, "Activity cleared");
      return;
    case "copy":
      navigator.clipboard?.writeText(el.dataset.text).then(() => toast("Copied"));
      return;
    case "logout":
      await api("/api/auth", { method: "DELETE" }).catch(() => {});
      state.authed = false;
      state.data = null;
      return render();
  }

  if (!ed) return;
  const d = ed.draft;
  switch (act) {
    case "close":
      return closeEditor();
    case "save":
      return saveEditor();
    case "scope":
      d.scope = el.dataset.v;
      break;
    case "style":
      d.delivery.style = el.dataset.v;
      break;
    case "pick": {
      const list = d.scope === "media" ? d.mediaIds : d.excludeMediaIds;
      const i = list.indexOf(el.dataset.media);
      if (i >= 0) list.splice(i, 1);
      else list.push(el.dataset.media);
      if (ed.isNew && d.scope === "media" && d.mediaIds.length === 1 && (!d.name || d.name.startsWith("Reel: ")))
        d.name = `Reel: ${captionShort(mediaById(d.mediaIds[0]), 32)}`;
      break;
    }
    case "rm-kw":
      d.trigger.keywords.splice(Number(el.dataset.i), 1);
      break;
    case "focus-chips":
      document.getElementById("kw-input")?.focus();
      return;
    case "add-res":
      d.delivery.resources.push({ title: "", url: "" });
      renderEditor();
      document.querySelector(`#editor-root [data-bind="delivery.resources.${d.delivery.resources.length - 1}.title"]`)?.focus();
      return;
    case "rm-res":
      d.delivery.resources.splice(Number(el.dataset.i), 1);
      if (!d.delivery.resources.length) d.delivery.resources.push({ title: "", url: "" });
      break;
    default:
      return;
  }
  ev.preventDefault();
  renderEditor();
});

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.dataset.act === "filter") {
    state.autoFilter = el.value;
    const pos = el.selectionStart;
    renderMain();
    const again = document.querySelector('[data-act="filter"]');
    again.focus();
    again.setSelectionRange(pos, pos);
    return;
  }
  if (!state.editor) return;
  if (el.id === "kw-input") {
    if (el.value.includes(",")) {
      addKeywords(el.value);
      renderEditor();
      refreshEditorLive();
    } else state.editor.keywordInput = el.value;
    return;
  }
  const bind = el.dataset.bind;
  if (!bind || el.type === "checkbox" || el.tagName === "SELECT") return;
  if (bind === "publicRepliesText") {
    state.editor.draft.publicReplies = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
  } else setPath(state.editor.draft, bind, el.value);
  refreshEditorLive(el);
});

document.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset.act === "toggle") {
    return mutate({ action: "toggleAutomation", id: el.dataset.id, enabled: el.checked }, el.checked ? "Turned on" : "Turned off");
  }
  if (el.dataset.act === "setting") {
    const value = el.dataset.invert ? !el.checked : el.checked;
    return mutate({ action: "saveSettings", settings: { [el.dataset.key]: value } }, "Settings saved");
  }
  if (state.editor && el.dataset.bind && (el.type === "checkbox" || el.tagName === "SELECT")) {
    setPath(state.editor.draft, el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
    renderEditor();
  }
});

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape" && state.editor) return closeEditor();
  if (ev.target.id === "kw-input") {
    if (ev.key === "Enter") {
      ev.preventDefault();
      addKeywords(ev.target.value);
      renderEditor();
    } else if (ev.key === "Backspace" && !ev.target.value && state.editor.draft.trigger.keywords.length) {
      state.editor.draft.trigger.keywords.pop();
      renderEditor();
    }
  }
});

document.addEventListener("submit", async (ev) => {
  if (ev.target.id !== "login-form") return;
  ev.preventDefault();
  const form = ev.target;
  const btn = form.querySelector("button");
  const err = form.querySelector("#login-error");
  btn.disabled = true;
  btn.textContent = "Logging in…";
  try {
    await api("/api/auth", { method: "POST", body: { password: form.password.value } });
    state.authed = true;
    await start();
  } catch (e) {
    err.hidden = false;
    err.textContent = e.message;
    btn.disabled = false;
    btn.textContent = "Log in";
  }
});

window.addEventListener("hashchange", () => {
  state.view = viewFromHash();
  if (state.data) render();
  if (state.view === "reels" && state.mediaState === "idle") loadMedia();
});

async function start() {
  render();
  try {
    await loadData();
  } catch (e) {
    $app.innerHTML = `<div class="boot"><div class="banner bad"><div><b>Couldn't load the dashboard</b>${esc(e.message)}</div></div></div>`;
    return;
  }
  render();
  loadMedia();
}

(async function boot() {
  try {
    const s = await api("/api/auth");
    state.authed = s.authed;
    state.passwordConfigured = s.passwordConfigured;
  } catch {
    state.authed = false;
  }
  if (state.authed) start();
  else render();
})();
