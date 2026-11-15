"use strict";

// Minimal dependency-free SPA that talks to the Go API. Auth is either real
// Supabase (email/password) or, when the backend runs with DEV_AUTH, a local
// dev sign-in. The access token is sent as a Bearer header on every /api call.

const $ = (id) => document.getElementById(id);
const TOKEN_KEY = "pm_token";

let supaClient = null;

function getToken() { try { return localStorage.getItem(TOKEN_KEY); } catch (_) { return null; } }
function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (_) {} }

function decodeJWT(t) {
  try {
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return { sub: p.sub, org: p.org_id || (p.app_metadata && p.app_metadata.org_id) || "", email: p.email };
  } catch (_) { return { sub: "", org: "", email: "" }; }
}

function toast(kind, msg) {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function showError(el, msg) { el.textContent = msg; el.hidden = false; }
function clearError(el) { el.hidden = true; }

// --- API ---
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: {
      "Authorization": "Bearer " + getToken(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) { signOut(); throw new Error("session expired"); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

// --- Views ---
function showLogin() { $("login").hidden = false; $("app").hidden = true; }
function showApp() { $("login").hidden = true; $("app").hidden = false; }

async function enterApp() {
  const { sub, org } = decodeJWT(getToken());
  $("idUser").textContent = sub || "—";
  $("idOrg").textContent = org ? org.slice(0, 8) + "…" : "—";
  $("scopePill").textContent = org ? "org_id = " + org.slice(0, 8) + "…" : "";
  showApp();
  await refresh();
}

async function refresh() {
  clearError($("appError"));
  try {
    const { projects } = await api("GET", "/api/projects");
    renderList(projects || []);
  } catch (e) {
    if (e.message !== "session expired") showError($("appError"), e.message);
  }
}

function renderList(items) {
  const list = $("list");
  if (!items.length) {
    list.innerHTML = '<div class="empty">No projects yet. Create your first one above.</div>';
    return;
  }
  list.innerHTML = "";
  for (const p of items) {
    const card = document.createElement("div");
    card.className = "card";
    const left = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = p.name;
    const meta = document.createElement("div");
    meta.className = "meta mono";
    meta.textContent = p.id.slice(0, 8) + " · " + new Date(p.created_at).toLocaleString();
    left.append(name, meta);
    const del = document.createElement("button");
    del.className = "del";
    del.textContent = "Delete";
    del.addEventListener("click", () => removeProject(p.id));
    card.append(left, del);
    list.appendChild(card);
  }
}

async function removeProject(id) {
  try { await api("DELETE", "/api/projects/" + id); toast("ok", "Deleted."); await refresh(); }
  catch (e) { if (e.message !== "session expired") toast("bad", e.message); }
}

// --- Auth flows ---
function signOut() {
  setToken(null);
  if (supaClient) supaClient.auth.signOut().catch(() => {});
  showLogin();
}

async function initConfig() {
  let cfg = {};
  try { cfg = await (await fetch("/config.json")).json(); } catch (_) {}

  if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
    supaClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    $("supaForm").hidden = false;
  } else if (cfg.devAuth) {
    $("devForm").hidden = false;
  } else {
    $("supaForm").hidden = false; // show form; will error clearly if unconfigured
    showError($("authError"), "No auth backend configured. Set SUPABASE_URL/ANON_KEY or DEV_AUTH.");
  }
}

// Supabase email/password
$("supaForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError($("authError"));
  if (!supaClient) { showError($("authError"), "Supabase is not configured."); return; }
  try {
    const { data, error } = await supaClient.auth.signInWithPassword({
      email: $("email").value, password: $("password").value,
    });
    if (error) throw error;
    const token = data.session && data.session.access_token;
    if (!token) throw new Error("no session returned");
    setToken(token);
    await enterApp();
  } catch (err) {
    showError($("authError"), err.message || "sign-in failed");
  }
});

// Dev login
document.querySelectorAll(".chip").forEach((c) =>
  c.addEventListener("click", () => { $("devOrg").value = c.dataset.org; }));

$("devForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError($("authError"));
  try {
    const res = await fetch("/dev/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: $("devOrg").value.trim(), user_id: $("devUser").value.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "dev login failed");
    setToken(data.access_token);
    await enterApp();
  } catch (err) {
    showError($("authError"), err.message);
  }
});

$("logout").addEventListener("click", signOut);

$("createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("projName").value.trim();
  if (!name) { toast("bad", "Name is required."); return; }
  try {
    await api("POST", "/api/projects", { name });
    $("projName").value = "";
    toast("ok", "Created “" + name + "”.");
    await refresh();
  } catch (err) {
    if (err.message !== "session expired") toast("bad", err.message);
  }
});

// --- Boot ---
(async function boot() {
  await initConfig();
  if (getToken()) {
    try { await enterApp(); return; } catch (_) { setToken(null); }
  }
  showLogin();
})();
