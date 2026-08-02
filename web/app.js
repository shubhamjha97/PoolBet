/* PoolBet SPA — vanilla JS against the FastAPI backend on the same origin. */
"use strict";

const state = { token: localStorage.getItem("pb_token") || null, user: null, group: null };

// per-market UI state (survives re-render)
let expandedMarket = null;          // id of the currently-open market card
const betSideByMarket = {};         // mid -> "YES" | "NO"
const lastPct = {};                 // mid -> last rendered YES% (so the bar can animate from it)

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const app = () => $("#app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (v) => Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

async function api(method, path, body) {
  const headers = { "content-type": "application/json" };
  if (state.token) headers["authorization"] = "Bearer " + state.token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.detail) ? JSON.stringify(data.detail) : `HTTP ${res.status}`);
  return data;
}

function toast(msg, kind = "") {
  const t = document.createElement("div");
  t.className = "toast " + kind;
  t.textContent = msg;
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
const err = (e) => toast(typeof e === "string" ? e : (e.message || "Something went wrong"), "err");

function closesInfo(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  const closed = ms <= 0;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3.6e6), m = Math.floor((abs % 3.6e6) / 6e4);
  const span = h >= 24 ? `${Math.floor(h / 24)}d` : h >= 1 ? `${h}h ${m}m` : `${m}m`;
  return { closed, text: closed ? `closed ${span} ago` : `closes in ${span}` };
}

// ---------- navigation + deep-link routing ----------
let routingSelf = false;
function setHash(h) { routingSelf = true; location.hash = h; setTimeout(() => { routingSelf = false; }, 0); }

const Nav = {
  async home() { state.group = null; expandedMarket = null; setHash("#/"); await renderHome(); },
  async group(id) { setHash(`#/group/${id}`); await renderGroup(id); },
  logout() { localStorage.removeItem("pb_token"); state.token = null; state.user = null; setHash("#/"); boot(); },
};
window.Nav = Nav;

// copy shareable deep links
window.copyGroupLink = (id) => { navigator.clipboard.writeText(`${location.origin}/#/group/${id}`); toast("Group link copied", "ok"); };
window.copyMarketLink = (id) => { navigator.clipboard.writeText(`${location.origin}/#/market/${id}`); toast("Market link copied", "ok"); };

async function handleRoute() {
  if (!state.token || !state.user) return renderAuth();
  const h = location.hash || "";
  let m;
  if ((m = h.match(/^#\/group\/([^/]+)$/))) return openGroupLink(m[1]);
  if ((m = h.match(/^#\/market\/([^/]+)$/))) return openMarketLink(m[1]);
  return renderHome();
}
window.addEventListener("hashchange", () => { if (!routingSelf) handleRoute(); });

async function openGroupLink(id) {
  try { await api("GET", `/groups/${id}`); }             // throws 403 if not a member
  catch {
    try { const p = await api("GET", `/groups/${id}/preview`); return renderAccessRequest(id, p.name, {}); }
    catch { return renderHome(); }
  }
  await renderGroup(id);                                  // member: render the group
}

async function openMarketLink(id) {
  let p;
  try { p = await api("GET", `/markets/${id}/preview`); }
  catch { return renderHome(); }
  if (p.is_member) {
    expandedMarket = id;                                  // open the shared market on arrival
    await renderGroup(p.group_id);
  } else {
    renderAccessRequest(p.group_id, p.group_name, { question: p.question });
  }
}

function renderAccessRequest(groupId, groupName, opts) {
  topbar();
  app().innerHTML = `
    <div class="center-screen"><div class="card auth-card" style="text-align:center">
      <div style="font-size:34px;margin-bottom:6px">🔒</div>
      <h1 style="font-size:22px">You're not in ${esc(groupName)}</h1>
      <p class="sub" style="margin-bottom:20px">${opts.question ? `Someone shared a market — <b>“${esc(opts.question)}”</b>. ` : ""}Ask the group owner to let you in.</p>
      <button class="btn" style="width:100%" id="reqAccess">Request access</button>
      <button class="btn ghost" style="width:100%;margin-top:8px" onclick="Nav.home()">Back to my groups</button>
    </div></div>`;
  $("#reqAccess").onclick = async () => {
    try {
      await api("POST", `/groups/${groupId}/access-requests`, {});
      $("#reqAccess").outerHTML = `<div class="empty" style="border-color:rgba(0,255,156,0.3);color:var(--neon)">Request sent ✓ — waiting for the owner to approve.</div>`;
    } catch (e) { err(e); }
  };
}

function topbar() {
  const admin = state.isAdmin ? `<button class="btn ghost sm" onclick="renderAdmin()">Admin</button>` : "";
  $("#who").innerHTML = state.user
    ? `${admin}<span class="hi-name">Hi, <b>${esc(state.user.name)}</b></span>
       <button class="btn ghost sm" onclick="Nav.logout()">Log out</button>`
    : "";
}

// ---------- auth ----------
let authFormMode = null;    // null (closed) | "signup" | "login"

const HERO_SVG = `
  <svg class="hero-graphic" viewBox="0 0 240 132" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="gY" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#00ff9c" stop-opacity="0.30"/><stop offset="1" stop-color="#00ff9c" stop-opacity="0"/>
      </linearGradient>
      <filter id="hglow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <g stroke="rgba(255,255,255,0.06)" stroke-width="1">
      <line x1="0" y1="30" x2="240" y2="30"/><line x1="0" y1="66" x2="240" y2="66"/><line x1="0" y1="102" x2="240" y2="102"/>
    </g>
    <path d="M2,96 C42,92 72,72 112,56 C152,40 186,30 230,20 L230,132 L2,132 Z" fill="url(#gY)"/>
    <path class="hero-no"  d="M2,42 C64,56 128,74 230,98" stroke="#ff2e7e" stroke-width="2" stroke-opacity="0.5" stroke-linecap="round"/>
    <path class="hero-yes" d="M2,96 C42,92 72,72 112,56 C152,40 186,30 230,20" stroke="#00ff9c" stroke-width="2.6" stroke-linecap="round" filter="url(#hglow)"/>
    <circle class="hero-dot" cx="230" cy="20" r="4.5" fill="#00ff9c" filter="url(#hglow)"/>
  </svg>`;

const G_ICON = `<svg viewBox="0 0 48 48" width="16" height="16" style="vertical-align:-3px;margin-right:7px"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;
const A_ICON = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" style="vertical-align:-3px;margin-right:7px"><path d="M16.365 1.43c0 1.14-.42 2.2-1.12 2.98-.84.95-2.2 1.68-3.32 1.6-.14-1.1.42-2.28 1.1-3.02.78-.86 2.16-1.5 3.34-1.56zM20.5 17.2c-.6 1.38-.88 2-1.66 3.22-1.08 1.7-2.6 3.82-4.48 3.84-1.68.02-2.1-1.09-4.38-1.08-2.28.01-2.74 1.1-4.42 1.08-1.88-.02-3.32-1.94-4.4-3.64C-1.02 16.13-1.3 9.9 1.9 6.62 3.02 5.4 4.64 4.65 6.32 4.64c1.7-.02 2.77 1.09 4.18 1.09 1.36 0 2.18-1.12 4.14-1.1 1.5.02 3.1.82 4.24 2.24-3.72 2.04-3.12 7.36.72 8.33z"/></svg>`;

function renderAuth() {
  topbar();
  authFormMode = null;
  app().innerHTML = `
    <div class="auth-bg" aria-hidden="true"><div class="auth-grid"></div><div class="auth-blob b1"></div><div class="auth-blob b2"></div></div>
    <div class="center-screen"><div class="landing" id="landing">
      <div class="hero-wrap">${HERO_SVG}</div>
      <h1 class="wordmark">PoolBet</h1>
      <p class="sub tagline" style="text-align:center;max-width:330px;margin:8px auto 24px">Parimutuel prediction markets for your friend group. Pool credits, call it, split the pot.</p>
      <div class="landing-actions seg2">
        <button class="btn" id="getStarted">Get started</button>
        <button class="btn ghost" id="haveAccount">Log in</button>
      </div>
      <div class="auth-drop" id="authDrop"><div><div class="auth-drop-inner">
        <div class="field"><label>Name</label><input id="name" placeholder="e.g. Alex" maxlength="60" autocomplete="username" /></div>
        <div class="field"><label>Password</label><input id="pw" type="password" placeholder="at least 4 characters" autocomplete="new-password" /></div>
        <button class="btn" style="width:100%" id="go">Create account</button>
        <div class="oauth-sep"><span>or</span></div>
        <button type="button" class="btn ghost oauth-btn" style="width:100%" onclick="googleLogin()">${G_ICON} Continue with Google</button>
        <button type="button" class="btn ghost oauth-btn" style="width:100%;margin-top:8px" onclick="toast('Apple sign-in is coming soon','err')">${A_ICON} Continue with Apple</button>
      </div></div></div>
    </div></div>`;

  $("#getStarted").onclick = () => toggleAuth("signup");
  $("#haveAccount").onclick = () => toggleAuth("login");

  const submit = async () => {
    const isLogin = authFormMode === "login";
    const name = $("#name").value.trim();
    const password = $("#pw").value;
    if (!name || !password) return err("Enter a name and password");
    try {
      const u = await api("POST", isLogin ? "/auth/login" : "/auth/signup", { name, password });
      localStorage.setItem("pb_token", u.api_token);
      state.token = u.api_token;
      toast(isLogin ? "Welcome back, " + u.name : "Welcome, " + u.name, "ok");
      boot();
    } catch (e) { err(e); }
  };
  $("#go").onclick = submit;
  $("#pw").addEventListener("keydown", (e) => e.key === "Enter" && submit());
  $("#name").addEventListener("keydown", (e) => e.key === "Enter" && $("#pw").focus());
}

// Sweep the hero up and drop the form open simultaneously (pure class toggles, no re-render).
function toggleAuth(mode) {
  const landing = $("#landing"), drop = $("#authDrop"), gs = $("#getStarted"), la = $("#haveAccount");
  if (authFormMode === mode) {           // clicking the active tab closes
    authFormMode = null;
    landing.classList.remove("compact"); drop.classList.remove("open");
    gs.className = "btn"; la.className = "btn ghost";
    return;
  }
  authFormMode = mode;
  const isLogin = mode === "login";
  landing.classList.add("compact"); drop.classList.add("open");
  $("#go").textContent = isLogin ? "Log in" : "Create account";
  const pw = $("#pw");
  pw.placeholder = isLogin ? "your password" : "at least 4 characters";
  pw.setAttribute("autocomplete", isLogin ? "current-password" : "new-password");
  gs.className = "btn" + (isLogin ? " ghost" : "");
  la.className = "btn" + (isLogin ? "" : " ghost");
  setTimeout(() => $("#name").focus(), 150);
}

// ---------- home (groups) ----------
async function renderHome() {
  topbar();
  app().innerHTML = `<h1>Your groups</h1><p class="sub">Create a pool or join one with an invite code.</p>
    <div class="row" style="margin-bottom:14px">
      <button class="btn" id="new">+ New group</button>
      <button class="btn ghost" id="join">Join with code</button>
      <button class="btn ghost" id="notif" title="Enable notifications" aria-label="Enable notifications" style="margin-left:auto">🔔</button>
    </div>
    <div id="joinDrop" class="join-drop"><div><div class="join-row">
      <input id="jc" placeholder="Invite code" maxlength="6" style="text-transform:uppercase;letter-spacing:.12em" />
      <button class="btn" id="doJoin">Join</button>
    </div></div></div>
    <div id="groups" class="stack"></div>`;
  $("#new").onclick = showCreateGroup;
  $("#notif").onclick = enableNotifications;
  $("#join").onclick = () => {
    const drop = $("#joinDrop");
    const open = drop.classList.toggle("open");
    if (open) setTimeout(() => $("#jc").focus(), 60);
  };
  const doJoin = async () => {
    const code = $("#jc").value.trim().toUpperCase();
    if (!code) return err("Enter an invite code");
    try {
      const g = await api("POST", "/groups/join", { invite_code: code });
      rememberGroup(g.id); toast("Joined " + g.name, "ok"); Nav.group(g.id);
    } catch (e) { err(e); }
  };
  $("#doJoin").onclick = doJoin;
  $("#jc").addEventListener("keydown", (e) => e.key === "Enter" && doJoin());

  // We don't have a "list my groups" endpoint; track joined groups locally.
  const ids = JSON.parse(localStorage.getItem("pb_groups") || "[]");
  const box = $("#groups");
  if (!ids.length) { box.innerHTML = `<div class="empty">No groups yet. Create one to start pooling.</div>`; return; }
  const cards = await Promise.all(ids.map(async (id) => {
    try {
      const g = await api("GET", "/groups/" + id);
      const me = g.members.find((m) => m.user_id === state.user.id);
      return `<div class="card link" onclick="Nav.group('${g.id}')">
        <div class="spread">
          <div><div style="font-weight:700;font-size:17px">${esc(g.name)}</div>
            <div class="muted" style="font-size:13px">${g.members.length} member${g.members.length > 1 ? "s" : ""} · code ${esc(g.invite_code)}</div></div>
          <div style="text-align:right"><div class="muted" style="font-size:12px">your balance</div>
            <div class="tnum" style="font-weight:700;font-size:18px">${me ? fmt(me.balance) : "—"}</div></div>
        </div></div>`;
    } catch { return ""; }
  }));
  box.innerHTML = cards.join("") || `<div class="empty">No groups yet.</div>`;
}

function rememberGroup(id) {
  const ids = JSON.parse(localStorage.getItem("pb_groups") || "[]");
  if (!ids.includes(id)) { ids.unshift(id); localStorage.setItem("pb_groups", JSON.stringify(ids)); }
}

function showCreateGroup() {
  openModal(`<h2 style="margin-top:0">New group</h2>
    <div class="field"><label>Group name</label><input id="gn" placeholder="Fantasy Football Crew" /></div>
    <div class="row">
      <div class="field grow"><label>Starting credits each</label><input id="gc" type="number" value="1000" /></div>
      <div class="field grow"><label>Dispute window (hrs)</label><input id="gw" type="number" value="12" /></div>
    </div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="create">Create</button></div>`);
  $("#create").onclick = async () => {
    try {
      const g = await api("POST", "/groups", {
        name: $("#gn").value.trim(),
        starting_credits: $("#gc").value,
        dispute_window_hours: Number($("#gw").value),
      });
      rememberGroup(g.id); closeModal(); toast("Group created", "ok"); Nav.group(g.id);
    } catch (e) { err(e); }
  };
}

function showJoinGroup() {
  openModal(`<h2 style="margin-top:0">Join a group</h2>
    <div class="field"><label>Invite code</label><input id="jc" placeholder="ABC123" style="text-transform:uppercase" /></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="dojoin">Join</button></div>`);
  $("#dojoin").onclick = async () => {
    try {
      const g = await api("POST", "/groups/join", { invite_code: $("#jc").value.trim().toUpperCase() });
      rememberGroup(g.id); closeModal(); toast("Joined " + g.name, "ok"); Nav.group(g.id);
    } catch (e) { err(e); }
  };
}

// ---------- group detail ----------
let groupTab = "markets"; // "markets" | "stats"
window.setGroupTab = (t) => { groupTab = t; if (state.group) renderGroup(state.group.id); };

async function renderGroup(id) {
  topbar();
  let g, markets;
  try { g = await api("GET", "/groups/" + id); markets = await api("GET", `/groups/${id}/markets`); }
  catch (e) { return err(e); }
  rememberGroup(id);
  state.group = g;
  state.groupMarkets = markets;
  const me = g.members.find((m) => m.user_id === state.user.id);

  app().innerHTML = `
    <div class="spread">
      <div><a onclick="Nav.home()" style="cursor:pointer;font-size:13px">← groups</a>
        <h1 style="margin-top:6px">${esc(g.name)}</h1></div>
      <div style="text-align:right"><div class="muted" style="font-size:12px">your balance</div>
        <div class="tnum" style="font-weight:800;font-size:24px">${me ? fmt(me.balance) : "—"}</div>
        <button class="btn ghost sm" style="margin-top:5px" onclick="buyIn('${g.id}')">+ Buy in</button></div>
    </div>
    <div class="row" style="margin:8px 0 14px;flex-wrap:wrap">
      <span class="muted" style="font-size:13px">invite code</span>
      <span class="code-chip" id="code">${esc(g.invite_code)}</span>
      <button class="btn ghost sm" id="copy">Copy code</button>
      <button class="btn ghost sm" onclick="copyGroupLink('${g.id}')">Copy link</button>
    </div>
    <div id="pendingReqs"></div>
    <div class="tabs">
      <button class="tab ${groupTab === "markets" ? "active" : ""}" onclick="setGroupTab('markets')">Markets</button>
      <button class="tab ${groupTab === "stats" ? "active" : ""}" onclick="setGroupTab('stats')">Stats</button>
      <button class="tab ${groupTab === "timeline" ? "active" : ""}" onclick="setGroupTab('timeline')">Timeline</button>
    </div>
    <div id="tabContent"></div>`;

  $("#copy").onclick = () => { navigator.clipboard.writeText(g.invite_code); toast("Code copied", "ok"); };
  loadPendingRequests(g.id);

  if (groupTab === "markets") renderMarketsTab(g, markets);
  else if (groupTab === "stats") renderStatsTab(g, markets);
  else renderTimelineTab(g);
}

// Group timeline — derived from the backend Event commit log.
async function renderTimelineTab(g) {
  const box = $("#tabContent");
  box.innerHTML = `<div class="empty">Loading timeline…</div>`;
  let events = [];
  try { events = await api("GET", `/groups/${g.id}/timeline`); }
  catch { box.innerHTML = `<div class="empty">Timeline unavailable.</div>`; return; }
  if (!events.length) { box.innerHTML = `<div class="empty">Nothing has happened yet.</div>`; return; }
  box.innerHTML = `<div class="timeline">${events.map(timelineRow).join("")}</div>`;
}

function timelineRow(e) {
  const p = e.payload || {};
  return `<div class="tl-item"><div class="tl-dot"></div><div class="tl-body">
    <div class="tl-text">${describeEvent(e, p)}</div>
    <div class="tl-when">${esc(timeAgo(e.ts))}</div></div></div>`;
}

function describeEvent(e, p) {
  const who = esc(e.actor_name || p.actor_name || "Someone");
  const mq = p.market_question ? ` — <span class="muted">${esc(p.market_question)}</span>` : "";
  switch (e.type) {
    case "bet_placed": {
      const name = p.anonymous ? esc(p.nickname_or_name || "An anonymous bettor") : who;
      return `<b>${name}</b> bet <b>${fmt(p.amount)}</b> on <b style="color:var(--${p.side === "YES" ? "yes" : "no"})">${esc(p.side || "")}</b>${mq}`;
    }
    case "market_created": return `<b>${who}</b> opened a market${p.question ? ` — <span class="muted">${esc(p.question)}</span>` : ""}`;
    case "market_resolved":
    case "market_settled": return `Resolved <b>${esc(p.outcome || "")}</b>${p.fraction != null ? ` (${Math.round(Number(p.fraction) * 100)}%)` : ""}${mq}`;
    case "buy_in": return `<b>${who}</b> bought in for <b>${fmt(p.amount)}</b>`;
    case "group_join": return `<b>${esc(p.name || who)}</b> joined`;
    case "group_create": return `<b>${who}</b> created the group`;
    case "access_approved": return `<b>${esc(p.name || who)}</b> was let in`;
    case "evidence_added": return `<b>${who}</b> added photo evidence${mq}`;
    case "rollback": return `⏪ <b>State rolled back</b>`;
    default: return `<b>${who}</b> · ${esc(e.type)}`;
  }
}

function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - Date.parse(ts)) / 1000);
  if (s < 60) return "just now";
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Owner-only: surface pending access requests with Approve buttons (403 for non-owners).
async function loadPendingRequests(gid) {
  let reqs = [];
  try { reqs = await api("GET", `/groups/${gid}/access-requests`); } catch { return; }
  const box = document.getElementById("pendingReqs");
  if (!box || !reqs.length) return;
  box.innerHTML = `<div class="card" style="margin-bottom:14px;border-color:rgba(0,255,156,0.28)">
    <div style="font-weight:600;margin-bottom:8px;font-size:14px">Access requests (${reqs.length})</div>
    ${reqs.map((r) => `<div class="spread" style="padding:7px 0;border-top:1px solid var(--hairline-2)">
      <span>${esc(r.name)}</span><button class="btn sm" onclick="approveReq('${gid}','${r.id}')">Approve</button></div>`).join("")}</div>`;
}
window.approveReq = async (gid, rid) => {
  try { await api("POST", `/groups/${gid}/access-requests/${rid}/approve`); toast("Approved — they're in", "ok"); renderGroup(gid); }
  catch (e) { err(e); }
};

function renderMarketsTab(g, markets) {
  $("#tabContent").innerHTML = `
    <div class="spread"><h2 style="margin-top:6px">Markets</h2><button class="btn sm" id="newm">+ New market</button></div>
    <div id="markets" class="stack"></div>`;
  $("#newm").onclick = () => showCreateMarket(g.id);
  const mbox = $("#markets");
  if (!markets.length) { mbox.innerHTML = `<div class="empty">No markets yet. Propose the first one.</div>`; return; }
  mbox.innerHTML = markets.map(marketCard).join("");
  animateMeters();
}

async function renderStatsTab(g, markets) {
  const box = $("#tabContent");
  box.innerHTML = `<div class="empty">Loading stats…</div>`;
  let pnl = [];
  try { pnl = await api("GET", `/groups/${g.id}/pnl`); } catch {}

  // Standings (leaderboard bars)
  const board = [...g.members].sort((a, b) => Number(b.balance) - Number(a.balance)).map((m) => ({
    label: m.name + (m.user_id === state.user.id ? " (you)" : ""),
    value: Number(m.balance), highlight: m.user_id === state.user.id,
  }));

  // Net worth over time (multi-line; you highlighted)
  const pseries = pnl.map((s) => ({
    name: s.name, highlight: s.user_id === state.user.id,
    points: s.series.map((p) => ({ t: Date.parse(p.t), v: p.balance })),
  }));

  // Cumulative volume wagered (from every bet's timestamp + amount)
  const allBets = [];
  markets.forEach((m) => m.bets.forEach((b) => allBets.push({ t: Date.parse(b.created_at), amount: Number(b.amount) })));
  allBets.sort((a, b) => a.t - b.t);
  let cum = 0; const vol = allBets.map((b) => ({ t: b.t, v: (cum += b.amount) }));

  // Probability history per market (reconstructed from ordered bets)
  const probCharts = markets.filter((m) => m.bets.length).map((m) => {
    const sorted = [...m.bets].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let y = 0, n = 0; const pts = [];
    sorted.forEach((b) => { if (b.side === "YES") y += Number(b.amount); else n += Number(b.amount); const t = y + n; pts.push({ t: Date.parse(b.created_at), yes: t ? y / t : 0.5 }); });
    return { q: m.question, pts };
  });

  const emptyC = `<div class="empty" style="padding:22px">Not enough data yet.</div>`;
  box.innerHTML = `
    <h2 style="margin-top:8px">Standings</h2>
    <div class="card">${Charts.bars(board, { format: (v) => fmt(v) })}</div>
    <h2>Net worth over time</h2>
    <div class="card">${pseries.some((s) => s.points.length > 1) ? Charts.multiLine(pseries) : emptyC}</div>
    <h2>Volume wagered (cumulative)</h2>
    <div class="card">${vol.length > 1 ? Charts.multiLine([{ name: "volume", highlight: true, points: vol }]) : emptyC}</div>
    <h2>Probability history</h2>
    ${probCharts.length ? probCharts.map((pc) => `<div class="card" style="margin-bottom:10px"><div style="font-weight:600;font-size:14px;margin-bottom:6px">${esc(pc.q)}</div>${Charts.probability(pc.pts)}</div>`).join("") : emptyC}`;
}

const LINK_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>`;

// Reconstruct the implied P(YES) path over time from a market's ordered bets.
function oddsSeries(m) {
  const sorted = [...m.bets].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  let y = 0, n = 0; const pts = [];
  sorted.forEach((b) => { if (b.side === "YES") y += Number(b.amount); else n += Number(b.amount); const t = y + n; pts.push({ t: Date.parse(b.created_at), yes: t ? y / t : 0.5 }); });
  return pts;
}

function marketCard(m) {
  const total = Number(m.yes_pool) + Number(m.no_pool);
  const yesPct = total > 0 ? Math.round(Number(m.yes_pool) / total * 100) : 50;
  const noPct = 100 - yesPct;
  const prev = (m.id in lastPct) ? lastPct[m.id] : yesPct;  // bar animates from here → yesPct
  const ci = closesInfo(m.closes_at);
  const meta = m.status === "RESOLVED" ? `resolved · ${m.outcome}`
    : m.status === "OPEN" ? ci.text : m.status.toLowerCase();
  const open = expandedMarket === m.id;
  return `<div class="card market ${open ? "expanded" : ""}" data-mid="${m.id}">
    <div class="card-head" onclick="toggleMarket('${m.id}')">
      <div class="spread" style="align-items:flex-start">
        <div class="grow"><div style="font-weight:600;font-size:16px;margin-bottom:8px">${esc(m.question)}</div></div>
        <div class="head-actions">
          <button class="icon-btn" onclick="event.stopPropagation();copyMarketLink('${m.id}')" title="Copy link" aria-label="Copy market link">${LINK_ICON}</button>
          <span class="pill ${m.status}">${m.status}</span>
        </div>
      </div>
      <div class="odds">
        <div class="labels"><span class="y">YES ${total > 0 ? yesPct + "%" : "—"}</span><span class="n">${total > 0 ? noPct + "%" : "—"} NO</span></div>
        <div class="meter" data-yes="${yesPct}"><div class="seg-y" style="width:${prev}%"></div><div class="seg-n" style="width:${100 - prev}%"></div></div>
      </div>
      <div class="head-foot"><span class="muted" style="font-size:12px">${esc(meta)} · pot ${fmt(total)}</span>
        <span class="chev">▼</span></div>
    </div>
    <div class="panel"><div class="inner"><div class="inner-pad">${marketPanel(m)}</div></div></div>
  </div>`;
}

// Animate every meter from its rendered (previous) width to its data-yes target.
function animateMeters() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".meter").forEach((mtr) => {
      const yes = Number(mtr.dataset.yes);
      const y = mtr.querySelector(".seg-y"), n = mtr.querySelector(".seg-n");
      if (y) y.style.width = yes + "%";
      if (n) n.style.width = (100 - yes) + "%";
      const card = mtr.closest(".card.market");
      if (card) lastPct[card.dataset.mid] = yes;
    });
  });
}

window.setClose = (spec) => {
  const H = 3.6e6, map = { "1h": H, "6h": 6 * H, "1d": 24 * H, "3d": 3 * 24 * H, "7d": 7 * 24 * H };
  const d = new Date(Date.now() + map[spec]);
  document.getElementById("mc").value = new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  document.querySelectorAll(".close-chip").forEach((c) => c.classList.toggle("sel", c.dataset.k === spec));
};

function showCreateMarket(gid) {
  const def = new Date(Date.now() + 24 * 3.6e6);
  const local = new Date(def.getTime() - def.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  openModal(`<h2 style="margin-top:0">New market</h2>
    <div class="field"><label>Question (YES / NO)</label><input id="mq" placeholder="Will the Chiefs cover the spread?" maxlength="280" /></div>
    <div class="field"><label>Rules / how it resolves (optional)</label><textarea id="mr" rows="2" maxlength="2000" placeholder="e.g. Resolves YES if the final margin is 3+ points."></textarea></div>
    <div class="field"><label>Closes at (no bets after this)</label>
      <div class="chips" style="margin-bottom:9px">
        ${[["1h", "1 hr"], ["6h", "6 hr"], ["1d", "1 day"], ["3d", "3 days"], ["7d", "7 days"]]
          .map(([k, t]) => `<button type="button" class="chip close-chip ${k === "1d" ? "sel" : ""}" data-k="${k}" onclick="setClose('${k}')">${t}</button>`).join("")}
      </div>
      <input id="mc" type="datetime-local" value="${local}" oninput="document.querySelectorAll('.close-chip').forEach(c=>c.classList.remove('sel'))" /></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" id="mk">Create</button></div>`);
  $("#mk").onclick = async () => {
    try {
      await api("POST", `/groups/${gid}/markets`, {
        question: $("#mq").value.trim(),
        rules: $("#mr").value.trim() || null,
        closes_at: new Date($("#mc").value).toISOString(),
      });
      closeModal(); toast("Market created", "ok"); renderGroup(gid);
    } catch (e) { err(e); }
  };
}

// ---------- inline market panel (bet / resolve / dispute / vote / settle) ----------
function outcomeLabel(outcome, fraction) {
  if (outcome === "SCALAR" && fraction != null) {
    const y = Math.round(Number(fraction) * 100);
    return `YES ${y}% / NO ${100 - y}%`;
  }
  return outcome || "—";
}

function marketPanel(m) {
  const me = state.group.members.find((x) => x.user_id === state.user.id);
  const bal = me ? Number(me.balance) : 0;
  const isProposer = m.proposer_user_id === state.user.id;
  const ci = closesInfo(m.closes_at);
  const mid = m.id;
  const side = betSideByMarket[mid] || "YES";

  let action = "";
  if (m.status === "OPEN" && !ci.closed) {
    action = `
      <div class="seg-toggle" style="margin:2px 0 14px">
        <button id="sy-${mid}" class="${side === "YES" ? "sel-y" : ""}" onclick="setSide('${mid}','YES')">YES</button>
        <button id="sn-${mid}" class="${side === "NO" ? "sel-n" : ""}" onclick="setSide('${mid}','NO')">NO</button>
      </div>
      <div class="spread" style="margin-bottom:8px"><label style="margin:0">Amount</label>
        <span class="muted" style="font-size:12px">balance <span class="tnum">${fmt(bal)}</span></span></div>
      <div class="stepper">
        <button class="step" onclick="stepAmount('${mid}',-10)">−</button>
        <input id="amt-${mid}" class="amt-in tnum" type="number" min="0" step="10" value="0" data-max="${Math.floor(bal)}" oninput="clampAmount('${mid}')" />
        <button class="step" onclick="stepAmount('${mid}',10)">+</button>
        <button class="step reset" onclick="setAmount('${mid}',0)" title="Reset to 0" aria-label="Reset to 0">⟲</button>
      </div>
      <div class="chips">
        ${[25, 50, 100].map((v) => `<button class="chip" onclick="stepAmount('${mid}',${v})">+${v}</button>`).join("")}
        <button class="chip" onclick="setAmount('${mid}',${Math.floor(bal)})">Max</button>
      </div>
      <label class="anon-toggle" for="anon-${mid}">
        <input type="checkbox" id="anon-${mid}" />
        <span class="anon-box"></span>
        <span>Bet anonymously <span class="muted" style="font-weight:400">— shown as a temp nickname</span></span>
      </label>
      <button class="btn ${side === "YES" ? "yes" : "no"}" id="bet-${mid}" style="width:100%;margin-top:12px" onclick="placeBet('${mid}')">Bet ${side}</button>`;
  } else if ((m.status === "OPEN" || m.status === "CLOSED") && ci.closed) {
    action = isProposer
      ? `<p class="muted" style="font-size:13px;margin:2px 0 10px">You proposed this market. Mark the result — a dispute window opens after.</p>
         <div class="row"><button class="btn yes grow" onclick="resolve('${mid}','YES')">YES won</button>
           <button class="btn no grow" onclick="resolve('${mid}','NO')">NO won</button>
           <button class="btn ghost" onclick="resolve('${mid}','VOID')">Void</button></div>
         <div class="scalar-box">
           <div class="spread" style="margin-bottom:8px"><label style="margin:0">Split result — YES share</label>
             <span class="tnum" style="font-weight:700" id="fraclabel-${mid}">50%</span></div>
           <input id="frac-${mid}" type="range" min="0" max="100" value="50" class="slider"
             oninput="document.getElementById('fraclabel-${mid}').textContent=this.value+'%'" />
           <button class="btn ghost" style="width:100%;margin-top:10px" onclick="resolveScalar('${mid}')">Settle at split %</button>
           <p class="muted" style="font-size:12px;margin:8px 0 0">Use when the result is partial (e.g. graded by the game score): the YES side takes that % of the pot, NO takes the rest.</p>
         </div>`
      : `<div class="empty">Betting closed. Waiting for the proposer to resolve.</div>`;
  } else if (m.status === "RESOLVING") {
    action = `<div class="card" style="background:var(--surface-2);margin-bottom:12px">
        <div class="spread"><span>Proposed outcome</span><b>${outcomeLabel(m.proposed_outcome, m.proposed_fraction)}</b></div></div>
      <div class="field" style="margin-bottom:10px"><input id="dr-${mid}" placeholder="Reason to dispute" maxlength="280" /></div>
      <div class="row"><button class="btn ghost grow" onclick="dispute('${mid}')">Dispute</button>
        <button class="btn grow" onclick="settle('${mid}')">Settle now</button></div>
      <p class="muted" style="font-size:12px">${isProposer
        ? "As the proposer you can settle now, skipping the dispute window."
        : "“Settle now” works once the dispute window elapses; otherwise dispute to force a vote."}</p>`;
  } else if (m.status === "DISPUTED") {
    action = `<p class="muted" style="font-size:13px;margin:2px 0 10px">Disputed — vote the outcome.</p>
      <div class="row"><button class="btn yes grow" onclick="vote('${mid}','YES')">YES</button>
        <button class="btn no grow" onclick="vote('${mid}','NO')">NO</button>
        <button class="btn ghost" onclick="vote('${mid}','VOID')">Void</button></div>
      <button class="btn" style="width:100%;margin-top:10px" onclick="settle('${mid}')">Tally votes & settle</button>`;
  } else if (m.status === "RESOLVED") {
    const c = m.outcome === "YES" ? "yes" : m.outcome === "NO" ? "no" : m.outcome === "SCALAR" ? "ink" : "muted";
    action = `<div class="card" style="background:var(--surface-2)">
      <div class="spread"><span>Final outcome</span><b style="color:var(--${c})">${outcomeLabel(m.outcome, m.outcome_fraction)}</b></div></div>`;
  }

  const bets = m.bets.length ? m.bets.map((b) => `
    <div class="bet-row"><span>${esc(b.member_name)}${b.is_anonymous ? ' <span class="anon-tag">anon</span>' : ""} · <b style="color:var(--${b.side === "YES" ? "yes" : "no"})">${b.side}</b></span>
      <span class="tnum">${fmt(b.amount)}${b.payout != null ? ` → <b>${fmt(b.payout)}</b>` : ""}</span></div>`).join("")
    : `<div class="muted" style="font-size:13px;padding:8px 0">No bets yet.</div>`;

  const probPts = oddsSeries(m);
  const oddsTl = probPts.length >= 2
    ? `<div class="card odds-tl"><div class="tl-label">Odds over time</div>${Charts.probability(probPts)}</div>`
    : "";
  const rulesBlock = m.rules
    ? `<div class="card" style="background:var(--surface-2);margin-bottom:14px"><div class="tl-label">Rules</div><div style="font-size:13px;white-space:pre-wrap">${esc(m.rules)}</div></div>`
    : "";
  const evidenceBlock = m.evidence_url
    ? `<div class="card" style="background:var(--surface-2);margin-bottom:14px"><div class="tl-label">Evidence</div><img src="${esc(m.evidence_url)}" alt="result evidence" style="width:100%;border-radius:10px;display:block" /></div>`
    : (ci.closed ? `<label class="btn ghost sm" style="display:inline-block;margin-bottom:14px">📷 Add photo evidence<input type="file" accept="image/*" style="display:none" onchange="uploadEvidence('${m.id}', this)" /></label>` : "");
  return `<div class="muted" style="font-size:12px;margin-bottom:12px">by ${esc(m.proposer_name)} · pot ${fmt(Number(m.yes_pool) + Number(m.no_pool))}</div>
    ${rulesBlock}
    ${oddsTl}
    ${evidenceBlock}
    ${action}
    <h2 style="margin:20px 0 6px">Bets</h2>${bets}`;
}

// expand/collapse one card at a time (pure DOM — no re-render, so the slide animates)
window.toggleMarket = (mid) => {
  expandedMarket = expandedMarket === mid ? null : mid;
  document.querySelectorAll(".card.market").forEach((c) =>
    c.classList.toggle("expanded", c.dataset.mid === expandedMarket));
};

window.setSide = (mid, side) => {
  betSideByMarket[mid] = side;
  const sy = $(`#sy-${mid}`), sn = $(`#sn-${mid}`), b = $(`#bet-${mid}`);
  if (sy) sy.className = side === "YES" ? "sel-y" : "";
  if (sn) sn.className = side === "NO" ? "sel-n" : "";
  if (b) { b.className = "btn " + (side === "YES" ? "yes" : "no"); b.style.width = "100%"; b.textContent = "Bet " + side; }
};

function clampVal(mid, v) { const el = $(`#amt-${mid}`); const max = Number(el.dataset.max || 1e15); return Math.max(0, Math.min(max, Math.round(v))); }
window.stepAmount = (mid, d) => { const el = $(`#amt-${mid}`); el.value = clampVal(mid, (Number(el.value) || 0) + d); };
window.setAmount = (mid, v) => { const el = $(`#amt-${mid}`); el.value = clampVal(mid, v); };
window.clampAmount = (mid) => { const el = $(`#amt-${mid}`); if (el.value !== "") el.value = clampVal(mid, Number(el.value) || 0); };

window.placeBet = async (mid) => {
  const amount = Number($(`#amt-${mid}`).value);
  if (!(amount > 0)) return err("Enter an amount");
  const side = betSideByMarket[mid] || "YES";
  const anonymous = document.getElementById(`anon-${mid}`)?.checked || false;
  try {
    await api("POST", `/markets/${mid}/bets`, { side, amount, anonymous });
    toast(`Bet ${fmt(amount)} on ${side}`, "ok");
    await renderGroup(state.group.id);  // re-renders + animates the odds bar
  } catch (e) { err(e); }
};

// resolve / dispute / vote / settle all refresh the group in place, keeping the card open
async function marketAction(run) { try { await run(); await renderGroup(state.group.id); } catch (e) { err(e); } }
window.resolve = (id, outcome) => marketAction(async () => { await api("POST", `/markets/${id}/resolve`, { outcome }); toast("Marked " + outcome, "ok"); });
window.resolveScalar = (id) => marketAction(async () => {
  const pct = Number($(`#frac-${id}`).value);
  await api("POST", `/markets/${id}/resolve`, { outcome: "SCALAR", yes_percent: pct });
  toast(`Marked YES ${pct}%`, "ok");
});
window.dispute = (id) => marketAction(async () => { const el = $(`#dr-${id}`); await api("POST", `/markets/${id}/dispute`, { reason: (el && el.value.trim()) || "disputed" }); toast("Disputed — goes to a vote", "ok"); });
window.vote = (id, choice) => marketAction(async () => { await api("POST", `/markets/${id}/vote`, { choice }); toast("Voted " + choice, "ok"); });
window.settle = (id) => marketAction(async () => { const r = await api("POST", `/markets/${id}/settle`); toast("Settled: " + r.outcome, "ok"); });

// ---------- modal plumbing ----------
function openModal(html) { $("#modal-root").innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal">${html}</div></div>`; }
function closeModal() { $("#modal-root").innerHTML = ""; }
window.openModal = openModal; window.closeModal = closeModal;

// ---------- admin dashboard (commit log + rollback) ----------
async function checkAdmin() {
  try { const r = await api("GET", "/admin/me"); state.isAdmin = !!(r && r.is_admin); if (state.isAdmin) topbar(); }
  catch { state.isAdmin = false; }
}

async function renderAdmin() {
  topbar();
  app().innerHTML = `
    <a onclick="Nav.home()" style="cursor:pointer;font-size:13px">← back</a>
    <h1 style="margin-top:6px">Admin</h1>
    <p class="sub">The commit log — every action is appended here, and you can roll the whole app back to any snapshot.</p>
    <h2>Rollback points</h2><div id="admSnaps" class="stack"></div>
    <h2 style="margin-top:26px">Commit log</h2><div id="admEvents"></div>`;
  try {
    const snaps = await api("GET", "/admin/snapshots");
    document.getElementById("admSnaps").innerHTML = snaps.length ? snaps.map((s) => `<div class="card spread">
      <div><div style="font-weight:600">${esc(s.label || "snapshot")}</div>
        <div class="muted" style="font-size:12px">${esc(timeAgo(s.created_at))}</div></div>
      <button class="btn no sm" onclick="rollbackTo('${s.id}')">Roll back</button></div>`).join("") : `<div class="empty">No snapshots yet.</div>`;
  } catch { document.getElementById("admSnaps").innerHTML = `<div class="empty">Unavailable.</div>`; }
  try {
    const evs = await api("GET", "/admin/events?limit=100");
    document.getElementById("admEvents").innerHTML = evs.length ? `<div class="timeline">${evs.map(timelineRow).join("")}</div>` : `<div class="empty">Empty.</div>`;
  } catch { document.getElementById("admEvents").innerHTML = `<div class="empty">Unavailable.</div>`; }
}
window.renderAdmin = renderAdmin;
window.rollbackTo = async (sid) => {
  if (!confirm("Roll the entire app state back to this snapshot? Everything after it is undone.")) return;
  try { await api("POST", "/admin/rollback", { snapshot_id: sid }); toast("Rolled back ✓", "ok"); renderAdmin(); }
  catch (e) { err(e); }
};

// ---------- buy-in / oauth ----------
window.buyIn = async (gid) => {
  try { await api("POST", `/groups/${gid}/buy-in`, {}); toast("Bought in 🪙", "ok"); renderGroup(gid); }
  catch (e) { err(e); }
};

window.googleLogin = async () => {
  // /auth/google/login returns 503 when unconfigured; probe so we don't dump JSON at the user.
  try {
    const r = await fetch("/auth/google/login", { redirect: "manual" });
    if (r.status === 503) return toast("Google sign-in isn't configured yet — needs deployment", "err");
  } catch { /* opaque redirect (configured) → fall through to navigate */ }
  location.href = "/auth/google/login";
};

// ---------- push notifications ----------
window.enableNotifications = async () => {
  if (!window.Push || !Push.isSupported()) return toast("Notifications aren't supported on this browser", "err");
  try {
    const r = await Push.enable();
    if (r && r.ok) toast("Notifications on 🔔", "ok");
    else toast("Couldn't enable notifications" + (r && r.reason ? `: ${r.reason}` : ""), "err");
  } catch (e) { toast((e && e.message) || "Enable failed", "err"); }
};

// ---------- photo evidence ----------
window.uploadEvidence = async (mid, input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch(`/markets/${mid}/evidence`, { method: "POST", headers: { authorization: "Bearer " + state.token }, body: fd });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || "upload failed");
    toast("Evidence added", "ok");
    if (state.group) await renderGroup(state.group.id);
  } catch (e) { err(e); }
};

// ---------- pull-down search ----------
window.onSearch = (q) => {
  q = (q || "").trim().toLowerCase();
  if (groupTab !== "markets" || !state.groupMarkets) return;
  const mbox = document.getElementById("markets");
  if (!mbox) return;
  const list = !q ? state.groupMarkets : state.groupMarkets.filter((m) =>
    m.question.toLowerCase().includes(q) ||
    (m.bets || []).some((b) => (b.member_name || "").toLowerCase().includes(q)));
  mbox.innerHTML = list.length
    ? list.map(marketCard).join("")
    : `<div class="empty">No markets match “${esc(q)}”.</div>`;
  animateMeters();
};

(function initPullSearch() {
  let startY = 0, atTop = false, wheelAccum = 0;
  const bar = () => document.getElementById("searchbar");
  const input = () => document.getElementById("searchInput");
  const reveal = () => { const b = bar(); if (b && !b.classList.contains("open")) { b.classList.add("open"); setTimeout(() => input() && input().focus(), 90); } };
  window.pbHideSearch = () => { const b = bar(); if (b) { b.classList.remove("open"); const i = input(); if (i) { i.value = ""; window.onSearch(""); i.blur(); } } };

  document.addEventListener("touchstart", (e) => { atTop = window.scrollY <= 0; startY = e.touches[0].clientY; }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!atTop) return;
    if (e.touches[0].clientY - startY > 72) { reveal(); atTop = false; }
  }, { passive: true });
  document.addEventListener("wheel", (e) => {
    if (window.scrollY <= 0 && e.deltaY < 0) { wheelAccum += -e.deltaY; if (wheelAccum > 90) { reveal(); wheelAccum = 0; } }
    else wheelAccum = 0;
  }, { passive: true });
  document.addEventListener("keydown", (e) => {
    const typing = /input|textarea/i.test(document.activeElement && document.activeElement.tagName);
    if (e.key === "/" && !typing) { e.preventDefault(); reveal(); }
    if (e.key === "Escape") window.pbHideSearch();
  });
})();

// ---------- PWA install ----------
let deferredPrompt = null;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

function showInstallButton() {
  const b = document.getElementById("installBtn");
  if (b && !isStandalone()) b.style.display = "inline-flex";
}

window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; showInstallButton(); });
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  const b = document.getElementById("installBtn"); if (b) b.style.display = "none";
  toast("Installed — find PoolBet on your home screen", "ok");
});

const ICON_SHARE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4"/><path d="m8 8 4-4 4 4"/><path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1"/></svg>`;
const ICON_ADD = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/></svg>`;
const ICON_HOME = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3"/><rect x="8.3" y="6" width="3.4" height="3.4" rx="1" fill="var(--neon)" stroke="none"/><rect x="12.3" y="6" width="3.4" height="3.4" rx="1"/><rect x="8.3" y="10" width="3.4" height="3.4" rx="1"/></svg>`;

function iosInstallHtml() {
  const step = (n, icon, txt) => `<div class="istep"><div class="istep-num">${n}</div>
    <div class="istep-ico">${icon}</div><div class="istep-txt">${txt}</div></div>`;
  return `
    <div class="spread"><h2 style="margin:0;text-transform:none;font-size:20px;color:var(--ink);letter-spacing:-0.02em">Install PoolBet</h2>
      <button class="btn ghost sm" onclick="closeModal()">Close</button></div>
    <p class="muted" style="font-size:13px;margin:8px 0 20px">Add it to your home screen for a full-screen, app-like experience.</p>
    <div class="install-steps">
      ${step(1, ICON_SHARE, `Tap the <b>Share</b> button in Safari's toolbar.`)}
      ${step(2, ICON_ADD, `Scroll down and tap <b>Add to Home Screen</b>.`)}
      ${step(3, ICON_HOME, `Tap <b>Add</b> — PoolBet lands on your home screen.`)}
    </div>
    <p class="muted" style="font-size:12px;margin-top:18px">On iPhone / iPad use <b>Safari</b>. On Android or desktop Chrome, the button installs it directly.</p>`;
}

window.showInstall = async () => {
  if (deferredPrompt) {                       // Android / desktop Chrome / Edge
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === "accepted") { const b = document.getElementById("installBtn"); if (b) b.style.display = "none"; }
    return;
  }
  openModal(iosInstallHtml());                // iOS Safari (no native prompt)
};

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
window.addEventListener("load", () => { if (!isStandalone()) showInstallButton(); });

// ---------- boot ----------
async function boot() {
  // OAuth callback hands the token back in the fragment: /#/token=<api_token>
  const tok = location.hash.match(/token=([^&]+)/);
  if (tok) { const t = decodeURIComponent(tok[1]); localStorage.setItem("pb_token", t); state.token = t; setHash("#/"); }
  if (!state.token) return renderAuth();
  // Only a failed identity check logs you out — a later render error must not.
  try {
    state.user = await api("GET", "/users/me");
  } catch {
    state.token = null;
    localStorage.removeItem("pb_token");
    return renderAuth();
  }
  if (window.Telemetry) Telemetry.init();   // app_open + session timing
  checkAdmin();                             // show Admin link if this user is an admin
  try { await handleRoute(); }
  catch (e) { err(e); }
}
boot();
