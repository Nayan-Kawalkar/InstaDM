// InstaDM dashboard — vanilla JS, no build step.

const $app = document.getElementById("app");
const LIMIT = { button: 20, text: 640, resources: 10 };
const VIEWS = ["overview", "automations", "reels", "activity", "settings"];

const state = {
  authed: false,
  passwordConfigured: true,
  data: null, // { automations, settings, stats, activity, account, status }
  media: [],
  mediaAfter: null,
  mediaState: "idle", // idle | loading | done | error
  mediaError: "",
  view: viewFromHash(),
  editor: null, // { draft, isNew, errors, original, tab, pickerFilter, keywordInput }
  autoFilter: "",
  reelSearch: "",
  reelFilter: "all", // all | with | without
};

// ---------- icons ----------
const ICON = {
  overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  automations: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  reels: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8.5h18M8.5 3l2.5 5.5M14.5 3l2.5 5.5M10.5 12.5v5l4.5-2.5z"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  userplus: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  reply: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
};
const icon = (n, s = 18) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n] ?? ""}</svg>`;
const BRAND_MARK = `<span class="brand-mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M3 5h18v11H10l-5 4v-4H3z"/></svg></span>`;

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
function setPath(o, p, v) {
  const ks = p.split(".");
  const last = ks.pop();
  ks.reduce((x, k) => (x[k] ??= {}), o)[last] = v;
}
const isUrl = (s) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(String(s).trim());
const isMobile = () => matchMedia("(max-width: 860px)").matches;

function viewFromHash() {
  const v = location.hash.replace("#", "");
  return VIEWS.includes(v) ? v : "overview";
}

function toast(msg, bad = false) {
  const el = document.createElement("div");
  el.className = "toast" + (bad ? " bad" : "");
  el.setAttribute("role", bad ? "alert" : "status");
  el.textContent = msg;
  document.getElementById("toasts").append(el);
  setTimeout(() => el.remove(), bad ? 5000 : 2600);
}

// Promise-based confirm dialog (replaces window.confirm)
function askConfirm({ title, body = "", confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const root = document.getElementById("dialog-root");
    const prevFocus = document.activeElement;
    root.innerHTML = `
      <div class="dialog-backdrop">
        <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" aria-describedby="dlg-b">
          <h3 id="dlg-t">${esc(title)}</h3>
          ${body ? `<p id="dlg-b">${esc(body)}</p>` : ""}
          <div class="dialog-actions">
            <button class="btn" data-dlg="0">Cancel</button>
            <button class="btn ${danger ? "danger-solid" : "primary"}" data-dlg="1">${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>`;
    const done = (v) => {
      root.innerHTML = "";
      document.removeEventListener("keydown", onKey, true);
      prevFocus?.focus?.();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        done(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    root.querySelector('[data-dlg="1"]').focus();
    root.onclick = (e) => {
      const b = e.target.closest("[data-dlg]");
      if (b) done(b.dataset.dlg === "1");
      else if (e.target.classList.contains("dialog-backdrop")) done(false);
    };
  });
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
    throw new Error("Your session expired. Please log in again.");
  }
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status})`);
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
const mediaTypeLabel = (t) => (t === "REEL" ? "Reel" : t === "CAROUSEL_ALBUM" ? "Carousel" : t === "VIDEO" ? "Video" : "Photo");

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

// ---------- shell ----------
const NAV = [
  ["overview", "Overview", "Home"],
  ["automations", "Auto-DMs", "Auto-DMs"],
  ["reels", "Reels & posts", "Reels"],
  ["activity", "Activity", "Activity"],
  ["settings", "Settings", "Settings"],
];

function render() {
  if (!state.authed) return renderLogin();
  if (!state.data) {
    $app.innerHTML = `<div class="boot">Loading your dashboard…</div>`;
    return;
  }
  const acc = state.data.account;
  $app.innerHTML = `
    <div class="shell">
      <nav class="sidebar" aria-label="Main">${sidebarHtml()}</nav>
      <div class="content">
        <header class="topbar">
          <div class="brand">${BRAND_MARK}InstaDM</div>
          <span class="grow"></span>
          ${statusPill()}
          ${acc?.profile_picture_url ? `<img src="${esc(acc.profile_picture_url)}" alt="@${esc(acc.username)}">` : `<span class="avatar-fallback"></span>`}
        </header>
        <main class="main" id="main"></main>
      </div>
      <nav class="tabbar" aria-label="Main">
        ${NAV.map(([id, , short]) => {
          const count = id === "automations" ? automations().filter((a) => a.enabled).length : 0;
          return `<button class="tab" data-act="nav" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ""}>
            ${icon(id, 22)}<span>${short}</span>${count ? `<span class="tab-count">${count}</span>` : ""}</button>`;
        }).join("")}
      </nav>
    </div>
    <div id="editor-root"></div>`;
  renderMain();
  renderEditor();
}

const statusPill = () =>
  state.data.settings.paused
    ? `<span class="badge warn"><span class="dot"></span>Paused</span>`
    : `<span class="badge ok"><span class="dot"></span>Running</span>`;

function sidebarHtml() {
  const acc = state.data.account;
  return `
    <div class="brand">${BRAND_MARK}InstaDM</div>
    ${NAV.map(
      ([id, label]) => `
      <button class="nav-item" data-act="nav" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ""}>
        ${icon(id)}${label}${id === "automations" ? `<span class="count">${automations().length}</span>` : ""}
      </button>`
    ).join("")}
    <div class="sidebar-foot">
      <div>${state.data.settings.paused ? `<span class="badge warn"><span class="dot"></span>Bot paused</span>` : `<span class="badge ok"><span class="dot"></span>Bot running</span>`}</div>
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
  if (state.data.status.storage) return "";
  return `
    <div class="banner warn" role="note">${icon("alert")}
      <div>
        <b>Changes won't be saved yet</b>
        Connect free storage: Vercel → your project → <b>Storage</b> → <b>Upstash (Redis)</b> → connect → redeploy.
        Until then the bot uses the rules in <span class="mono">config.js</span>.
      </div>
    </div>`;
}

function pageHead(title, sub, actions = "") {
  return `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${actions ? `<div class="page-actions">${actions}</div>` : ""}</div>`;
}

const newBtn = (label = "New auto-DM") => `<button class="btn primary" data-act="new">${icon("plus", 16)}${label}</button>`;

// ---------- overview ----------
function overviewHtml() {
  const t = totals();
  const list = automations();
  const active = list.filter((a) => a.enabled).length;
  const s = state.data.status;
  const acc = state.data.account;
  const checks = [
    [acc?.ok, "Instagram connected", acc?.ok ? `@${esc(acc.username)} · ${plural(acc.media_count ?? 0, "post")}` : esc(acc?.error ?? "Check your token and IG_USER_ID")],
    [s.appSecret && s.verifyToken, "Webhook secured", "Only real Instagram events are accepted"],
    [s.storage, "Storage connected", s.storage ? "Your auto-DMs are saved" : "Changes won't be saved: see the banner above"],
    [active > 0, "Auto-DM switched on", active ? `${active} active` : "Create one to get started"],
    [!state.data.settings.paused, "Bot running", state.data.settings.paused ? "Paused in Settings" : "Replying to comments"],
  ];
  const recent = state.data.activity.slice(0, 5);
  const firstName = acc?.name?.split(/[\s|]/)[0];
  return `
    ${pageHead(firstName ? `Hi ${esc(firstName)} 👋` : "Overview", "Here's how your auto-DMs are doing.", list.length ? newBtn() : "")}
    ${list.length ? "" : `
      <section class="card start">
        <div>
          <h2>Set up your first auto-DM</h2>
          <p class="muted" style="margin:0">It takes about a minute.</p>
          <ol>
            <li><span>Pick a reel you want to share something on.</span></li>
            <li><span>Choose the word people should comment, like <b>link</b>.</span></li>
            <li><span>Add the links they should get in their DMs.</span></li>
          </ol>
        </div>
        <button class="btn primary" data-act="nav" data-view="reels">${icon("reels", 16)}Choose a reel</button>
      </section>`}
    <div class="stats">
      ${statTile("Comments", t.comments, "matched a keyword")}
      ${statTile("DMs started", t.openers, "opening message sent")}
      ${statTile("Asked to follow", t.followPrompts, "weren't following yet")}
      ${statTile("Links delivered", t.delivered, "resources sent")}
    </div>
    <div class="grid-2">
      <section class="card">
        <div class="card-head"><h2>Recent activity</h2><button class="btn ghost sm" data-act="nav" data-view="activity">See all</button></div>
        ${recent.length ? feedHtml(recent, true) : `<div class="empty small">Nothing yet. When someone comments your keyword, it shows up here.</div>`}
      </section>
      <section class="card">
        <div class="card-head"><h2>Setup</h2></div>
        <div class="card-pad">
          <ul class="checklist">
            ${checks.map(([ok, title, sub]) => `<li><span class="ic ${ok ? "ok" : "bad"}" aria-hidden="true">${ok ? "✓" : "!"}</span>
              <div><b>${title}</b><div class="muted small">${sub}</div></div></li>`).join("")}
          </ul>
        </div>
      </section>
    </div>`;
}

const statTile = (label, value, hint) =>
  `<div class="card stat"><div class="label">${label}</div><div class="value">${fmtNum(value)}</div><div class="hint">${hint}</div></div>`;

// ---------- automations ----------
function automationsHtml() {
  const q = state.autoFilter.toLowerCase();
  const all = automations();
  const list = all.filter((a) => !q || a.name.toLowerCase().includes(q) || a.trigger.keywords.some((k) => k.includes(q)));
  return `
    ${pageHead("Auto-DMs", "Each one watches some reels, waits for a keyword, and DMs the links you choose.", newBtn())}
    ${all.length > 3 ? `<div class="toolbar"><label class="search">${icon("search", 16)}<span class="sr-only">Search auto-DMs</span>
      <input type="search" placeholder="Search by name or keyword" data-act="filter" value="${esc(state.autoFilter)}"></label></div>` : ""}
    <section class="card">
      ${
        list.length
          ? `<div class="auto-list">${list.map(autoRowHtml).join("")}</div>`
          : all.length
            ? `<div class="empty">No auto-DM matches “${esc(state.autoFilter)}”.</div>`
            : `<div class="empty"><h3>No auto-DMs yet</h3><p>Pick a reel and choose what people get when they comment on it.</p>
               <button class="btn primary" data-act="nav" data-view="reels">${icon("reels", 16)}Choose a reel</button></div>`
      }
    </section>`;
}

function scopeSummary(a) {
  if (a.scope === "all") return a.excludeMediaIds.length ? `All posts except ${a.excludeMediaIds.length}` : "All posts & reels";
  return a.mediaIds.length === 1 ? "1 reel" : `${a.mediaIds.length} reels`;
}

function thumbsHtml(ids) {
  const shown = ids.slice(0, 3);
  if (!shown.length) return "";
  return `<span class="thumbs" aria-hidden="true">${shown
    .map((id) => {
      const m = mediaById(id);
      return m?.thumb ? `<img src="${esc(m.thumb)}" alt="" loading="lazy">` : `<span class="ph"></span>`;
    })
    .join("")}</span>`;
}

function autoRowHtml(a) {
  const trig =
    a.trigger.anyComment && !a.trigger.keywords.length
      ? `<span class="badge">Any comment</span>`
      : a.trigger.keywords.slice(0, 3).map((k) => `<span class="badge accent">“${esc(k)}”</span>`).join("") +
        (a.trigger.keywords.length > 3 ? `<span class="badge">+${a.trigger.keywords.length - 3}</span>` : "");
  return `
    <div class="auto-row ${a.enabled ? "" : "off"}">
      <label class="switch" title="${a.enabled ? "On" : "Off"}">
        <input type="checkbox" data-act="toggle" data-id="${a.id}" ${a.enabled ? "checked" : ""} aria-label="${esc(a.name)} is ${a.enabled ? "on" : "off"}">
        <span class="track"></span>
      </label>
      <div class="auto-main" data-act="edit" data-id="${a.id}">
        <h3>${esc(a.name)}</h3>
        <div class="meta">
          <span class="badge">${thumbsHtml(a.scope === "media" ? a.mediaIds : [])}${scopeSummary(a)}</span>
          ${trig}
          ${a.requireFollow ? `<span class="badge warn">Followers only</span>` : ""}
          <span class="badge">${a.delivery.resources.length ? plural(a.delivery.resources.length, "link") : "Message only"}</span>
        </div>
      </div>
      <div class="nums">
        <div><b>${fmtNum(statOf(a.id, "comments"))}</b>comments</div>
        <div><b>${fmtNum(statOf(a.id, "delivered"))}</b>delivered</div>
      </div>
      <div class="auto-actions">
        <button class="btn sm" data-act="edit" data-id="${a.id}">Edit</button>
        <button class="btn ghost sm icon-btn" data-act="duplicate" data-id="${a.id}" title="Duplicate" aria-label="Duplicate ${esc(a.name)}">${icon("copy", 16)}</button>
        <button class="btn ghost sm icon-btn danger" data-act="delete" data-id="${a.id}" title="Delete" aria-label="Delete ${esc(a.name)}">${icon("trash", 16)}</button>
      </div>
    </div>`;
}

// ---------- reels ----------
function filteredReels() {
  const q = state.reelSearch.toLowerCase().trim();
  return state.media.filter((m) => {
    if (q && !(m.caption ?? "").toLowerCase().includes(q)) return false;
    const has = autosForMedia(m.id).some((a) => a.enabled);
    if (state.reelFilter === "with") return has;
    if (state.reelFilter === "without") return !has;
    return true;
  });
}

function reelsHtml() {
  const head = pageHead("Reels & posts", "Tap a reel to set what people get when they comment on it. Reels without an auto-DM are left alone.",
    `<button class="btn" data-act="reload-media">${icon("refresh", 16)}Refresh</button>`);
  if (state.mediaState === "error") return head + `<div class="banner bad">${icon("alert")}<div><b>Couldn't load your posts</b>${esc(state.mediaError)}</div></div>`;
  if (!state.media.length && state.mediaState !== "done") return head + `<div class="empty">Loading your reels…</div>`;
  if (!state.media.length) return head + `<div class="empty"><h3>No posts yet</h3><p>Post a reel on Instagram, then tap Refresh.</p></div>`;
  const list = filteredReels();
  const seg = (v, label) => `<button data-act="reel-filter" data-v="${v}" aria-pressed="${state.reelFilter === v}">${label}</button>`;
  return `${head}
    <div class="toolbar">
      <label class="search">${icon("search", 16)}<span class="sr-only">Search captions</span>
        <input type="search" placeholder="Search captions" data-act="reel-search" value="${esc(state.reelSearch)}"></label>
      <div class="segmented" role="group" aria-label="Filter reels">${seg("all", "All")}${seg("with", "With auto-DM")}${seg("without", "Without")}</div>
    </div>
    ${list.length ? `<div class="reel-grid">${list.map(reelCardHtml).join("")}</div>` : `<div class="empty">No reels match.</div>`}
    ${state.mediaAfter ? `<div class="row" style="justify-content:center;margin-top:20px"><button class="btn" data-act="more-media" ${state.mediaState === "loading" ? "disabled" : ""}>${state.mediaState === "loading" ? "Loading…" : "Load older posts"}</button></div>` : ""}`;
}

function reelCardHtml(m) {
  const autos = autosForMedia(m.id);
  const own = autos.find((a) => a.scope === "media");
  const active = autos.find((a) => a.enabled);
  const status = !autos.length
    ? `<span class="badge">No auto-DM</span>`
    : active
      ? `<span class="badge ok"><span class="dot"></span>${esc(active.name)}</span>`
      : `<span class="badge warn">${esc(autos[0].name)} · off</span>`;
  const act = own ? `data-act="edit" data-id="${own.id}"` : `data-act="new-for" data-media="${m.id}"`;
  return `
    <article class="card reel">
      <button class="media" ${act} style="${m.thumb ? `background-image:url('${esc(m.thumb)}')` : ""}" aria-label="${own ? "Edit auto-DM for" : "Add auto-DM to"}: ${esc(captionShort(m, 60))}">
        <span class="type">${mediaTypeLabel(m.type)}</span>
        <span class="status">${status}</span>
      </button>
      <div class="body">
        <div class="cap">${esc(captionShort(m, 120))}</div>
        <div class="muted small">${timeAgo(m.timestamp)} · ${plural(m.comments, "comment")}</div>
        <div class="foot">
          ${own
            ? `<button class="btn sm" ${act}>Edit auto-DM</button>`
            : `<button class="btn sm primary" ${act}>${icon("plus", 15)}Add auto-DM</button>`}
          <a class="btn ghost sm" href="${esc(m.permalink)}" target="_blank" rel="noopener">${icon("external", 15)}<span>Open</span></a>
        </div>
      </div>
    </article>`;
}

// ---------- activity ----------
const FEED = {
  opener: ["send", "Sent the opening DM to", "", "Couldn't send the opening DM to"],
  follow_prompt: ["userplus", "Asked to follow:", "warn", "Couldn't ask to follow:"],
  delivered: ["link", "Delivered links to", "ok", "Couldn't deliver links to"],
  public_reply: ["reply", "Replied publicly to", "", "Couldn't reply publicly to"],
};

function feedHtml(rows, compact = false) {
  return `<ul class="feed">${rows
    .map((e) => {
      const [ic, label, tone, failLabel] = FEED[e.type] ?? ["send", e.type, "", `Failed: ${e.type}`];
      const failed = e.ok === false;
      return `<li class="feed-item">
        <span class="feed-ic ${failed ? "bad" : tone}">${icon(failed ? "alert" : ic, 15)}</span>
        <div class="feed-body">
          <div>${esc(failed ? failLabel : label)} <b>${e.user ? "@" + esc(e.user) : "someone"}</b></div>
          <div class="muted small">${esc(e.automation ?? "")}${e.text && !compact ? ` · commented “${esc(e.text)}”` : ""}</div>
          ${failed ? `<div class="feed-err">${esc(e.error ?? "Unknown error")}</div>` : ""}
        </div>
        <time class="muted small" datetime="${esc(e.t)}" title="${esc(new Date(e.t).toLocaleString())}">${timeAgo(e.t)}</time>
      </li>`;
    })
    .join("")}</ul>`;
}

function activityHtml() {
  const rows = state.data.activity;
  return `
    ${pageHead("Activity", "Everything the bot did recently. If something failed, Instagram's reason is shown.",
      `<button class="btn" data-act="refresh">${icon("refresh", 16)}Refresh</button>${rows.length ? `<button class="btn ghost danger" data-act="clear-activity">Clear</button>` : ""}`)}
    <section class="card">${rows.length ? feedHtml(rows) : `<div class="empty"><h3>No activity yet</h3><p>Comment your keyword on a reel from a second account to try it out.</p></div>`}</section>`;
}

// ---------- settings ----------
function settingsHtml() {
  const st = state.data.settings;
  const s = state.data.status;
  const webhook = location.origin + "/api/webhook";
  return `
    ${pageHead("Settings", "Switches that apply to every auto-DM, and your connection status.")}
    <div class="stack" style="max-width:760px">
      <section class="card card-pad stack">
        <h2>Bot</h2>
        ${switchRow("paused", !st.paused, "Bot is running", "Turn off to pause every auto-DM at once. Comments made while paused are ignored.", true)}
        ${switchRow("sendResourceIfFollowCheckFails", st.sendResourceIfFollowCheckFails, "Still send links if Instagram can't check follows", "Rarely, Instagram's follow check fails. On: send the links anyway. Off: ask them to follow again.")}
      </section>
      <section class="card card-pad stack">
        <h2>Connection</h2>
        <ul class="checklist">
          ${connRow(s.token, "Access token", s.token ? (s.tokenType === "facebook" ? "Unified login token (EAA…)" : "Instagram login token (IGAA…)") : "IG_ACCESS_TOKEN is missing")}
          ${connRow(s.userId, "Instagram account ID", s.userId ? "Set" : "IG_USER_ID is missing")}
          ${connRow(s.appSecret, "App secret", s.appSecret ? "Webhooks are verified" : "APP_SECRET is missing, so webhooks are rejected")}
          ${connRow(s.verifyToken, "Verify token", s.verifyToken ? "Set" : "VERIFY_TOKEN is missing")}
          ${connRow(s.storage, "Storage", s.storage ? "Upstash Redis connected" : "Not connected: changes aren't saved", !s.storage)}
        </ul>
        <div class="field"><span>Webhook URL <span class="help">paste into Meta → Configure webhooks</span></span>
          <div class="row" style="flex-wrap:nowrap"><input type="text" readonly value="${esc(webhook)}" class="mono" aria-label="Webhook URL"><button class="btn" data-act="copy" data-text="${esc(webhook)}">${icon("copy", 16)}Copy</button></div>
        </div>
        <p class="muted small" style="margin:0">Your access token expires about every 60 days. Set a reminder to make a new one in Meta and update it in Vercel.</p>
      </section>
      <section class="card card-pad row">
        <div class="grow"><h2>Session</h2><div class="muted small">You stay logged in for 7 days on this device.</div></div>
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
        <span class="brand-mark" aria-hidden="true" style="width:44px;height:44px;border-radius:12px">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff"><path d="M3 5h18v11H10l-5 4v-4H3z"/></svg>
        </span>
        <h1>InstaDM</h1>
        <p class="muted" style="margin:0 0 18px">Log in to manage your reel auto-DMs.</p>
        ${
          state.passwordConfigured
            ? `<label class="field"><span>Password</span><input type="password" name="password" autocomplete="current-password" required autofocus></label>
               <p class="errors" id="login-error" role="alert" hidden style="margin-top:12px;padding-left:14px"></p>
               <button class="btn primary" style="width:100%;margin-top:16px;min-height:44px" type="submit">Log in</button>`
            : `<div class="banner warn" style="margin:0">${icon("alert")}<div><b>Set a dashboard password first</b>
               Add <span class="mono">DASHBOARD_PASSWORD</span> in Vercel → Settings → Environment Variables, then redeploy.</div></div>`
        }
      </form>
    </div>`;
}

// ---------- editor ----------
const FLOWS = [
  { id: "followers", title: "Followers only", desc: "They tap a button, then must follow you to get the links.", set: (d) => { d.requireFollow = true; d.opener.enabled = true; } },
  { id: "button", title: "Tap to get", desc: "They get a DM with a button. Tapping it sends the links.", set: (d) => { d.requireFollow = false; d.opener.enabled = true; } },
  { id: "instant", title: "Send instantly", desc: "The links go straight to their DMs, with no button.", set: (d) => { d.requireFollow = false; d.opener.enabled = false; } },
];
const flowOf = (d) => (d.requireFollow ? "followers" : d.opener.enabled ? "button" : "instant");

function blankAutomation(mediaIds = []) {
  const m = mediaIds.length === 1 ? mediaById(mediaIds[0]) : null;
  return {
    id: null,
    name: m ? captionShort(m, 36) : "",
    enabled: true,
    scope: "media",
    mediaIds,
    excludeMediaIds: [],
    trigger: { anyComment: false, keywords: ["link"], matchMode: "contains", dmKeywords: true },
    publicReplies: ["Sent you a DM! 📩", "Check your DMs 🙌", "Just sent it to you ✨"],
    opener: { enabled: true, text: "Hey {username}! 👋 Thanks for commenting. Tap below and I'll send it over.", button: "Send me the link" },
    requireFollow: true,
    followPrompt: { text: "Almost there! 🙌 This is just for my followers. Follow my account, then tap the button below.", button: "I followed ✅" },
    delivery: { message: "Here you go 🎉", resources: [{ title: "", url: "" }], style: "buttons" },
  };
}

function openEditor(draft, isNew) {
  if (!draft.delivery.resources.length) draft.delivery.resources.push({ title: "", url: "" });
  state.editor = { draft, isNew, errors: [], original: JSON.stringify(draft), tab: "form", pickerFilter: "", keywordInput: "" };
  renderEditor();
  if (state.mediaState === "idle") loadMedia();
  if (!isMobile()) document.querySelector("#editor-root [data-bind='name']")?.focus();
}

const isDirty = () => state.editor && JSON.stringify(state.editor.draft) !== state.editor.original;

async function requestCloseEditor() {
  if (isDirty() && !(await askConfirm({ title: "Discard changes?", body: "Your edits to this auto-DM haven't been saved.", confirmLabel: "Discard", danger: true }))) return;
  state.editor = null;
  renderEditor();
}

function counter(value, max) {
  const n = (value ?? "").length;
  return `<div class="counter ${n > max ? "over" : ""}">${n}/${max}</div>`;
}

function editorHtml() {
  const { draft: d, isNew, errors, tab } = state.editor;
  const flow = flowOf(d);
  let n = 0;
  const num = () => `<span class="n">${++n}</span>`;
  return `
  <div class="overlay" data-act="overlay">
    <div class="drawer" role="dialog" aria-modal="true" aria-labelledby="ed-title">
      <div class="drawer-head">
        <button class="btn ghost icon-btn" data-act="close" aria-label="Close">${icon("x")}</button>
        <h2 id="ed-title" class="grow">${isNew ? "New auto-DM" : "Edit auto-DM"}</h2>
        <label class="switch"><input type="checkbox" data-bind="enabled" ${d.enabled ? "checked" : ""}><span class="track"></span><span class="small">${d.enabled ? "On" : "Off"}</span></label>
        <div class="segmented ed-tabs" role="tablist" aria-label="Editor view">
          <button role="tab" data-act="ed-tab" data-v="form" aria-pressed="${tab === "form"}" aria-selected="${tab === "form"}">Setup</button>
          <button role="tab" data-act="ed-tab" data-v="preview" aria-pressed="${tab === "preview"}" aria-selected="${tab === "preview"}">Preview</button>
        </div>
      </div>
      <div class="drawer-body tab-${tab}">
        <div class="stack">
          ${errors.length ? `<ul class="errors" role="alert">${errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>` : ""}

          <section class="card section">
            <label class="field"><span>Name <span class="help">only you see this</span></span>
              <input type="text" data-bind="name" value="${esc(d.name)}" placeholder="e.g. Free Figma kit" maxlength="80"></label>
          </section>

          <section class="card section">
            <div class="section-title">${num()}<div><h3>Which reels?</h3><p>${d.scope === "media" ? `${d.mediaIds.length} selected. Tap to select.` : `Runs on every post. Tap a reel to skip it (${d.excludeMediaIds.length} skipped).`}</p></div></div>
            <div class="segmented" role="group" aria-label="Which reels">
              <button data-act="scope" data-v="media" aria-pressed="${d.scope === "media"}">Specific reels</button>
              <button data-act="scope" data-v="all" aria-pressed="${d.scope === "all"}">All posts</button>
            </div>
            ${pickerHtml()}
          </section>

          <section class="card section">
            <div class="section-title">${num()}<div><h3>What should they comment?</h3><p>Not case-sensitive. Press Enter after each word.</p></div></div>
            <div class="chips" data-act="focus-chips">
              ${d.trigger.keywords.map((k, i) => `<span class="chip">${esc(k)}<button data-act="rm-kw" data-i="${i}" aria-label="Remove ${esc(k)}">×</button></span>`).join("")}
              <input type="text" id="kw-input" data-act="kw-input" enterkeyhint="done" autocapitalize="off" value="${esc(state.editor.keywordInput)}" placeholder="${d.trigger.keywords.length ? "Add another…" : "e.g. link"}" aria-label="Add keyword">
            </div>
            <label class="check"><input type="checkbox" data-bind="trigger.anyComment" ${d.trigger.anyComment ? "checked" : ""}>
              <span><b>Reply to every comment</b><br><span class="muted small">Even if it doesn't contain a keyword.</span></span></label>
            <details class="more">
              <summary>More options</summary>
              <div class="stack">
                <label class="field"><span>How to match</span>
                  <select data-bind="trigger.matchMode">
                    <option value="contains" ${d.trigger.matchMode === "contains" ? "selected" : ""}>Comment contains the word (e.g. “links pls”)</option>
                    <option value="word" ${d.trigger.matchMode === "word" ? "selected" : ""}>Exact word only</option>
                  </select></label>
                <label class="check"><input type="checkbox" data-bind="trigger.dmKeywords" ${d.trigger.dmKeywords ? "checked" : ""}>
                  <span><b>Also works if they DM you the word</b><br><span class="muted small">Handy when people message instead of commenting.</span></span></label>
              </div>
            </details>
          </section>

          <section class="card section">
            <div class="section-title">${num()}<div><h3>How should it work?</h3><p>You can fine-tune the messages below.</p></div></div>
            <div class="flows" role="group" aria-label="Flow">
              ${FLOWS.map((f) => `<button class="flow" data-act="flow" data-v="${f.id}" aria-pressed="${flow === f.id}"><b>${f.title}</b><span>${f.desc}</span></button>`).join("")}
            </div>
          </section>

          <section class="card section">
            <div class="section-title">${num()}<div><h3>What do they get?</h3><p>Your message and links. Use {username} for their name.</p></div></div>
            <label class="field"><span>Message</span>
              <textarea data-bind="delivery.message" rows="2" placeholder="Here you go 🎉">${esc(d.delivery.message)}</textarea>${counter(d.delivery.message, LIMIT.text)}</label>
            <div class="field"><span>Links <span class="help">PDF, Drive, Notion, YouTube, your site…</span></span>
              <div class="stack" style="gap:8px">
                ${d.delivery.resources.map((r, i) => `
                  <div class="res-row">
                    <input type="text" data-bind="delivery.resources.${i}.title" value="${esc(r.title)}" placeholder="Button text, e.g. Get the kit" maxlength="80" aria-label="Link ${i + 1} title">
                    <input type="url" inputmode="url" autocapitalize="off" data-bind="delivery.resources.${i}.url" value="${esc(r.url)}" placeholder="https://…" aria-label="Link ${i + 1} address">
                    <button class="btn ghost icon-btn" data-act="rm-res" data-i="${i}" aria-label="Remove link ${i + 1}">${icon("x", 16)}</button>
                  </div>`).join("")}
                <div><button class="btn sm" data-act="add-res" ${d.delivery.resources.length >= LIMIT.resources ? "disabled" : ""}>${icon("plus", 15)}Add link</button></div>
              </div>
            </div>
            <details class="more">
              <summary>How links are shown</summary>
              <div class="stack">
                <div class="segmented" role="group" aria-label="Link style">
                  <button data-act="style" data-v="buttons" aria-pressed="${d.delivery.style === "buttons"}">Tappable buttons</button>
                  <button data-act="style" data-v="text" aria-pressed="${d.delivery.style === "text"}">Plain links</button>
                </div>
                <span class="help">Buttons work for up to 3 links (button text max 20 characters). With more, they're sent as plain links.</span>
              </div>
            </details>
          </section>

          ${flow !== "instant" ? `
          <section class="card section">
            <div class="section-title">${num()}<div><h3>Opening DM</h3><p>The first message, with a button they tap.</p></div></div>
            <label class="field"><span>Message</span>
              <textarea data-bind="opener.text" rows="3">${esc(d.opener.text)}</textarea>${counter(d.opener.text, LIMIT.text)}</label>
            <label class="field"><span>Button text</span>
              <input type="text" data-bind="opener.button" value="${esc(d.opener.button)}" placeholder="Send me the link">${counter(d.opener.button, LIMIT.button)}</label>
          </section>` : ""}

          ${flow === "followers" ? `
          <section class="card section">
            <div class="section-title">${num()}<div><h3>If they don't follow you yet</h3><p>Tapping the button checks again.</p></div></div>
            <label class="field"><span>Message</span>
              <textarea data-bind="followPrompt.text" rows="3">${esc(d.followPrompt.text)}</textarea>${counter(d.followPrompt.text, LIMIT.text)}</label>
            <label class="field"><span>Button text</span>
              <input type="text" data-bind="followPrompt.button" value="${esc(d.followPrompt.button)}">${counter(d.followPrompt.button, LIMIT.button)}</label>
          </section>` : ""}

          <section class="card section">
            <div class="section-title">${num()}<div><h3>Reply under the comment</h3><p>Optional. One per line; a random one is used so replies don't look spammy.</p></div></div>
            <textarea data-bind="publicRepliesText" rows="3" placeholder="Sent you a DM! 📩">${esc(d.publicReplies.join("\n"))}</textarea>
          </section>
        </div>
        <aside class="preview" aria-label="Preview">${previewHtml()}</aside>
      </div>
      <div class="drawer-foot">
        ${!isNew ? `<button class="btn ghost danger" data-act="delete" data-id="${d.id}">${icon("trash", 16)}<span>Delete</span></button><span class="grow"></span>` : ""}
        <button class="btn" data-act="close">Cancel</button>
        <button class="btn primary" data-act="save">${isNew ? "Create auto-DM" : "Save"}</button>
      </div>
    </div>
  </div>`;
}

function pickerHtml() {
  const ed = state.editor;
  if (state.mediaState === "error") return `<div class="banner bad" style="margin:0">${icon("alert")}<div><b>Couldn't load reels</b>${esc(state.mediaError)}</div></div>`;
  if (!state.media.length) return `<div class="muted small">${state.mediaState === "done" ? "No posts found." : "Loading your reels…"}</div>`;
  return `
    ${state.media.length > 9 ? `<label class="search">${icon("search", 16)}<span class="sr-only">Search reels</span>
      <input type="search" placeholder="Search reels by caption" data-act="picker-search" value="${esc(ed.pickerFilter)}"></label>` : ""}
    <div class="picker" id="picker-grid">${pickerGridHtml()}</div>
    ${state.mediaAfter ? `<div><button class="btn sm" data-act="more-media" ${state.mediaState === "loading" ? "disabled" : ""}>${state.mediaState === "loading" ? "Loading…" : "Load older posts"}</button></div>` : ""}`;
}

function pickerGridHtml() {
  const { draft: d, pickerFilter } = state.editor;
  const q = pickerFilter.toLowerCase().trim();
  const selected = d.scope === "media" ? d.mediaIds : d.excludeMediaIds;
  const items = state.media.filter((m) => !q || (m.caption ?? "").toLowerCase().includes(q) || selected.includes(m.id));
  if (!items.length) return `<div class="muted small" style="grid-column:1/-1">No reels match.</div>`;
  return items
    .map((m) => {
      const on = selected.includes(m.id);
      const other = automations().find((a) => a.id !== d.id && a.scope === "media" && a.mediaIds.includes(m.id));
      return `<button class="pick ${d.scope === "all" ? "excluded" : ""}" data-act="pick" data-media="${m.id}" aria-pressed="${on}" aria-label="${esc(captionShort(m, 60))}${other ? ` (used by ${esc(other.name)})` : ""}">
        <div class="img" style="${m.thumb ? `background-image:url('${esc(m.thumb)}')` : ""}"></div>
        <span class="tick" aria-hidden="true">${on ? (d.scope === "all" ? "–" : "✓") : ""}</span>
        ${other ? `<span class="taken">${esc(other.name)}</span>` : ""}
      </button>`;
    })
    .join("");
}

function previewHtml() {
  const d = state.editor.draft;
  const user = "friend";
  const fill = (t) => esc((t ?? "").replaceAll("{username}", user));
  const kw = d.trigger.keywords[0] ?? (d.trigger.anyComment ? "🔥🔥" : "…");
  const res = d.delivery.resources.filter((r) => r.url.trim());
  const flow = flowOf(d);
  const asButtons = d.delivery.style === "buttons" && res.length >= 1 && res.length <= 3;
  const deliveryBubble = asButtons
    ? `<div class="bubble in card-msg"><div class="txt">${fill(d.delivery.message || "Here you go 👇")}</div>${res.map((r) => `<span class="b">${esc(r.title || "Open link")}</span>`).join("")}</div>`
    : `<div class="bubble in">${[fill(d.delivery.message), ...res.map((r) => (r.title ? `🔗 ${esc(r.title)}\n${esc(r.url)}` : esc(r.url)))].filter(Boolean).join("\n\n") || "🙌"}</div>`;
  const acc = state.data.account;
  return `
    <div class="phone">
      <div class="phone-top">${acc?.profile_picture_url ? `<img src="${esc(acc.profile_picture_url)}" alt="" style="width:24px;height:24px;border-radius:50%">` : ""}
        ${acc?.ok ? "@" + esc(acc.username) : "Your account"}<span class="grow"></span><span class="muted small">Preview</span></div>
      <div class="phone-body">
        <span class="step-label">On the reel</span>
        <div class="comment-preview"><span class="avatar-fallback"></span><div><b>${user}</b> ${esc(kw)}
          ${d.publicReplies.length ? `<div class="reply"><b>you</b> ${fill(d.publicReplies[0])}</div>` : ""}</div></div>
        <span class="step-label">In their DMs</span>
        ${flow !== "instant" ? `<div class="bubble in card-msg"><div class="txt">${fill(d.opener.text || "Tap below 👇")}</div><span class="b">${esc(d.opener.button || "Send it")}</span></div>
          <div class="bubble out">${esc(d.opener.button || "Send it")}</div>` : ""}
        ${flow === "followers" ? `<span class="step-label">If not following</span>
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
  const activeKey = active?.dataset?.bind ?? (active?.id === "kw-input" ? "#kw" : active?.dataset?.act === "picker-search" ? "#ps" : null);
  const scroll = root.querySelector(".drawer-body")?.scrollTop ?? 0;
  const pickerScroll = root.querySelector("#picker-grid")?.scrollTop ?? 0;
  const openDetails = [...root.querySelectorAll("details.more")].map((x) => x.open);
  root.innerHTML = editorHtml();
  document.body.style.overflow = "hidden";
  root.querySelector(".drawer-body").scrollTop = scroll;
  const pg = root.querySelector("#picker-grid");
  if (pg) pg.scrollTop = pickerScroll;
  root.querySelectorAll("details.more").forEach((x, i) => { if (openDetails[i]) x.open = true; });
  if (activeKey) {
    const el =
      activeKey === "#kw" ? root.querySelector("#kw-input")
      : activeKey === "#ps" ? root.querySelector('[data-act="picker-search"]')
      : root.querySelector(`[data-bind="${activeKey}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      if (el.setSelectionRange && typeof el.value === "string" && !["url", "checkbox"].includes(el.type)) el.setSelectionRange(el.value.length, el.value.length);
    }
  }
}

// Update only the preview and counters while typing (keeps focus & cursor).
function refreshEditorLive(target) {
  const root = document.getElementById("editor-root");
  root.querySelector(".preview").innerHTML = previewHtml();
  const c = target?.parentElement?.querySelector(".counter");
  if (c) c.outerHTML = counter(target.value, target.tagName === "TEXTAREA" ? LIMIT.text : LIMIT.button);
}

function addKeywords(raw) {
  const d = state.editor.draft;
  for (const p of raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)) if (!d.trigger.keywords.includes(p)) d.trigger.keywords.push(p);
  state.editor.keywordInput = "";
}

function validate(d) {
  const e = [];
  const flow = flowOf(d);
  if (!d.name.trim()) e.push("Give it a name, so you can find it later.");
  if (d.scope === "media" && !d.mediaIds.length) e.push("Pick at least one reel, or choose “All posts”.");
  if (!d.trigger.keywords.length && !d.trigger.anyComment) e.push("Add a word people should comment, or turn on “Reply to every comment”.");
  if (flow !== "instant") {
    if (!d.opener.text.trim()) e.push("Write the opening DM.");
    if (!d.opener.button.trim()) e.push("Add the opening DM's button text.");
    if (d.opener.button.length > LIMIT.button) e.push(`The opening button text must be ${LIMIT.button} characters or fewer.`);
  }
  if (flow === "followers") {
    if (!d.followPrompt.text.trim()) e.push("Write the message for people who don't follow you yet.");
    if (!d.followPrompt.button.trim()) e.push("Add the “I followed” button text.");
    if (d.followPrompt.button.length > LIMIT.button) e.push(`The follow button text must be ${LIMIT.button} characters or fewer.`);
  }
  if ([d.opener.text, d.followPrompt.text, d.delivery.message].some((t) => t.length > LIMIT.text)) e.push(`Messages must be ${LIMIT.text} characters or fewer.`);
  const res = d.delivery.resources.filter((r) => r.url.trim() || r.title.trim());
  res.forEach((r, i) => { if (!isUrl(r.url)) e.push(`Link ${i + 1}: enter a full address starting with https://`); });
  if (!d.delivery.message.trim() && !res.length) e.push("Add a message or at least one link to send.");
  if (d.delivery.style === "buttons" && res.length <= 3 && res.some((r) => (r.title || "Open link").length > LIMIT.button))
    e.push(`Button text for links must be ${LIMIT.button} characters or fewer (or choose “Plain links”).`);
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
  if (ed.keywordInput.trim()) addKeywords(ed.keywordInput);
  ed.errors = validate(ed.draft);
  if (ed.errors.length) {
    ed.tab = "form";
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
    toast(ed.isNew ? "Auto-DM created 🎉" : "Saved");
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = ed.isNew ? "Create auto-DM" : "Save";
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

function go(view) {
  if (location.hash === "#" + view) return;
  location.hash = view;
}

document.addEventListener("click", async (ev) => {
  const el = ev.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const ed = state.editor;

  if (act === "overlay") {
    if (ev.target === el) requestCloseEditor();
    return;
  }
  if (["toggle", "setting", "filter", "kw-input", "reel-search", "picker-search"].includes(act)) return; // handled by change/input

  switch (act) {
    case "nav":
      go(el.dataset.view);
      window.scrollTo({ top: 0 });
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
      if (!a) return;
      const ok = await askConfirm({ title: `Delete “${a.name}”?`, body: "People commenting on its reels won't get DMs anymore. This can't be undone.", confirmLabel: "Delete", danger: true });
      if (!ok) return;
      state.editor = null;
      return mutate({ action: "deleteAutomation", id: a.id }, "Auto-DM deleted");
    }
    case "refresh":
      try { await loadData(); render(); toast("Up to date"); } catch (e) { toast(e.message, true); }
      return;
    case "reload-media":
      state.media = [];
      state.mediaAfter = null;
      state.mediaState = "idle";
      return loadMedia();
    case "more-media":
      return loadMedia(true);
    case "reel-filter":
      state.reelFilter = el.dataset.v;
      return renderMain();
    case "clear-activity":
      if (await askConfirm({ title: "Clear activity?", body: "This removes the activity history. Your auto-DMs aren't affected.", confirmLabel: "Clear" }))
        mutate({ action: "clearActivity" }, "Activity cleared");
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
      return requestCloseEditor();
    case "save":
      return saveEditor();
    case "ed-tab":
      ed.tab = el.dataset.v;
      renderEditor();
      document.querySelector("#editor-root .drawer-body").scrollTop = 0;
      return;
    case "scope":
      d.scope = el.dataset.v;
      break;
    case "flow":
      FLOWS.find((f) => f.id === el.dataset.v)?.set(d);
      break;
    case "style":
      d.delivery.style = el.dataset.v;
      break;
    case "pick": {
      const list = d.scope === "media" ? d.mediaIds : d.excludeMediaIds;
      const i = list.indexOf(el.dataset.media);
      if (i >= 0) list.splice(i, 1);
      else list.push(el.dataset.media);
      if (ed.isNew && d.scope === "media" && d.mediaIds.length === 1 && !d.name.trim()) d.name = captionShort(mediaById(d.mediaIds[0]), 36);
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

function rerenderKeepingFocus(selector) {
  const el = document.querySelector(selector);
  const pos = el?.selectionStart;
  renderMain();
  const again = document.querySelector(selector);
  if (again) {
    again.focus();
    if (pos != null) again.setSelectionRange(pos, pos);
  }
}

document.addEventListener("input", (ev) => {
  const el = ev.target;
  if (el.dataset.act === "filter") {
    state.autoFilter = el.value;
    return rerenderKeepingFocus('[data-act="filter"]');
  }
  if (el.dataset.act === "reel-search") {
    state.reelSearch = el.value;
    return rerenderKeepingFocus('[data-act="reel-search"]');
  }
  if (!state.editor) return;
  if (el.dataset.act === "picker-search") {
    state.editor.pickerFilter = el.value;
    document.getElementById("picker-grid").innerHTML = pickerGridHtml();
    return;
  }
  if (el.id === "kw-input") {
    if (el.value.includes(",")) {
      addKeywords(el.value);
      renderEditor();
    } else state.editor.keywordInput = el.value;
    return;
  }
  const bind = el.dataset.bind;
  if (!bind || el.type === "checkbox" || el.tagName === "SELECT") return;
  if (bind === "publicRepliesText") state.editor.draft.publicReplies = el.value.split("\n").map((s) => s.trim()).filter(Boolean);
  else setPath(state.editor.draft, bind, el.value);
  refreshEditorLive(el);
});

document.addEventListener("change", async (ev) => {
  const el = ev.target;
  if (el.dataset.act === "toggle") {
    return mutate({ action: "toggleAutomation", id: el.dataset.id, enabled: el.checked }, el.checked ? "Turned on" : "Turned off");
  }
  if (el.dataset.act === "setting") {
    const value = el.dataset.invert ? !el.checked : el.checked;
    return mutate({ action: "saveSettings", settings: { [el.dataset.key]: value } }, "Saved");
  }
  if (state.editor && el.dataset.bind && (el.type === "checkbox" || el.tagName === "SELECT")) {
    setPath(state.editor.draft, el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
    renderEditor();
  }
});

document.addEventListener("keydown", (ev) => {
  if (state.editor && (ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "s") {
    ev.preventDefault();
    return saveEditor();
  }
  if (ev.key === "Escape" && state.editor) return requestCloseEditor();
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

window.addEventListener("beforeunload", (e) => {
  if (isDirty()) e.preventDefault();
});

async function start() {
  render();
  try {
    await loadData();
  } catch (e) {
    $app.innerHTML = `<div class="boot"><div class="banner bad">${icon("alert")}<div><b>Couldn't load the dashboard</b>${esc(e.message)}</div></div></div>`;
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
