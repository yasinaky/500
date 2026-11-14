'use strict';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DETACHED = params.has('tab');
if (DETACHED) document.body.classList.add('detached');

const DEFAULTS = {
  scope: 'current', showImages: true, showVideos: true, minW: 100, minH: 100,
  quality: 'max', sort: 'area', convert: 'original', jpgQuality: 92,
  folder: 'Medya/{site}', naming: 'original', parallel: 3, saveAs: false, dedupe: true, offFormats: [],
};
let S = { ...DEFAULTS };
let items = [];
let lastClicked = null;

const VIDEO_EXTS = new Set(['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv', 'avi', '3gp']);
const MIME_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif',
  'image/svg+xml': 'svg', 'image/bmp': 'bmp', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico', 'image/tiff': 'tiff',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/ogg': 'ogv', 'video/x-matroska': 'mkv', 'video/3gpp': '3gp',
};

// ---------------- yardımcılar ----------------
function extOf(v) {
  if (v.mime && MIME_EXT[v.mime.split(';')[0].trim().toLowerCase()]) return MIME_EXT[v.mime.split(';')[0].trim().toLowerCase()];
  if (v.url.startsWith('data:')) {
    const m = v.url.match(/^data:([^;,]+)/);
    return (m && MIME_EXT[m[1].toLowerCase()]) || 'bin';
  }
  try {
    const p = new URL(v.url).pathname;
    const m = p.match(/\.([a-z0-9]{2,5})$/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg').replace('jfif', 'jpg');
    const fm = new URL(v.url).searchParams.get('format') || new URL(v.url).searchParams.get('fm');
    if (fm) return fm.toLowerCase().replace('jpeg', 'jpg');
  } catch {}
  return '';
}
const fmtBytes = (b) => !b ? '' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : b < 1073741824 ? (b / 1048576).toFixed(1) + ' MB' : (b / 1073741824).toFixed(2) + ' GB';
const dims = (v) => v.w && v.h ? `${v.w}×${v.h}` : v.w ? `${v.w}w` : v.h ? `${v.h}p` : '';
const area = (v) => v.w && v.h ? v.w * v.h : v.w ? v.w * v.w * 0.66 : v.h ? v.h * v.h * 1.78 : 0;
const shortSide = (v) => v.w && v.h ? Math.min(v.w, v.h) : v.h || v.w || 0;
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'sayfa'; } };
const clean = (s, max = 100) => String(s || '').replace(/[\u0000-\u001f<>:"/\\|?*~]+/g, '_').replace(/\s+/g, ' ').replace(/^[.\s_]+|[.\s_]+$/g, '').slice(0, max) || 'dosya';
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cmpVariant = (a, b) => (area(b) - area(a)) || ((b.bytes || 0) - (a.bytes || 0));

function nameOf(v) {
  if (v.url.startsWith('data:')) return '';
  try {
    const seg = new URL(v.url).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(seg).replace(/\.[a-z0-9]{2,5}$/i, '');
  } catch { return ''; }
}

// ---------------- ayarlar ----------------
async function loadSettings() {
  const d = await chrome.storage.local.get('settings');
  S = { ...DEFAULTS, ...(d.settings || {}) };
  for (const k of ['scope', 'minW', 'minH', 'quality', 'sort', 'convert', 'jpgQuality', 'folder', 'naming', 'parallel']) $('#' + k).value = S[k];
  for (const k of ['showImages', 'showVideos', 'saveAs', 'dedupe']) $('#' + k).checked = S[k];
  $('#jpgQualityVal').textContent = S.jpgQuality;
  $('#qWrap').style.display = S.convert === 'jpg' || S.convert === 'webp' ? '' : 'none';
}
const saveSettings = () => chrome.storage.local.set({ settings: S });

function bindSetting(id, kind, onChange) {
  const el = $('#' + id);
  el.addEventListener(kind === 'check' ? 'change' : 'input', () => {
    S[id] = kind === 'check' ? el.checked : kind === 'num' ? Math.max(0, +el.value || 0) : el.value;
    saveSettings();
    onChange && onChange();
  });
}

// ---------------- tarama ----------------
async function getTargetTabs() {
  let active;
  if (DETACHED) active = await chrome.tabs.get(+params.get('tab')).catch(() => null);
  else [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  let tabs;
  if (S.scope === 'current') tabs = active ? [active] : [];
  else if (S.scope === 'window') tabs = await chrome.tabs.query(active ? { windowId: active.windowId } : { currentWindow: true });
  else tabs = await chrome.tabs.query({});
  return tabs;
}

async function scan() {
  $('#scan').disabled = true;
  $('#scan').textContent = 'Taranıyor…';
  $('#grid').innerHTML = '<div class="empty">Sekmeler taranıyor…</div>';
  const notes = [];
  try {
    const allTabs = await getTargetTabs();
    const tabs = allTabs.filter((t) => /^(https?|file):/i.test(t.url || ''));
    const skipped = allTabs.length - tabs.length;
    let failed = 0, sleeping = 0, blob = 0;

    const results = await Promise.all(tabs.map(async (tab) => {
      if (tab.discarded) { sleeping++; return { tab, frames: [] }; }
      try {
        const r = await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['collector.js'] });
        return { tab, frames: r.map((x) => x.result).filter(Boolean) };
      } catch { failed++; return { tab, frames: [] }; }
    }));
    const net = await chrome.runtime.sendMessage({ type: 'getNetMedia', tabIds: tabs.map((t) => t.id) }).catch(() => ({}));

    const raw = [];
    for (const { tab, frames } of results) {
      for (const f of frames) {
        blob += f.blobVideos || 0;
        for (const it of f.items) raw.push({ ...it, tab });
      }
      for (const n of (net && net[tab.id]) || []) {
        raw.push({ type: 'video', variants: [{ url: n.url, mime: n.mime, bytes: n.bytes, label: 'Ağdan yakalandı' }], thumb: null, alt: '', tab });
      }
    }
    items = buildItems(raw);

    if (S.scope !== 'current') notes.push(`${tabs.length} sekme tarandı.`);
    if (skipped) notes.push(`${skipped} sekme atlandı (chrome://, Web Mağazası gibi korumalı sayfalar).`);
    if (sleeping) notes.push(`${sleeping} sekme uyku modunda; taramak için o sekmeyi bir kez açın.`);
    if (failed) notes.push(`${failed} sekmeye erişilemedi.`);
    if (blob) notes.push(`${blob} video akış (blob/HLS/DASH) olarak oynatılıyor; bunlar parça parça geldiği için doğrudan indirilemez. Videoyu biraz oynatıp tekrar tarayın — doğrudan dosya varsa "Ağdan yakalandı" olarak görünür.`);
  } catch (e) {
    notes.push('Hata: ' + e.message);
    items = [];
  }
  $('#notice').hidden = !notes.length;
  $('#notice').textContent = notes.join(' ');
  $('#scan').disabled = false;
  $('#scan').textContent = 'Yeniden tara';
  renderAll();
  enrich();
}

function normVariant(v) {
  return { url: v.url, w: v.w || null, h: v.h || null, bytes: v.bytes || null, mime: v.mime || null, label: v.label || null, ext: null };
}

function buildItems(raw) {
  const out = [];
  const byUrl = new Map();
  let order = 0;
  for (const r of raw) {
    const vars = r.variants.filter((v) => v && v.url).map(normVariant);
    if (!vars.length) continue;
    let target = null;
    if (S.dedupe) for (const v of vars) { const k = v.url.split('#')[0]; if (byUrl.has(k)) { target = byUrl.get(k); break; } }
    if (!target) {
      target = { id: out.length, order: order++, type: r.type, variants: [], thumb: r.thumb, alt: r.alt, tab: r.tab, manual: false, chosen: 0, selected: false };
      out.push(target);
    }
    if (r.type === 'video' && target.type !== 'video') target.type = 'video';
    if (!target.thumb && r.thumb) target.thumb = r.thumb;
    if (!target.alt && r.alt) target.alt = r.alt;
    for (const v of vars) {
      const k = v.url.split('#')[0];
      const ex = target.variants.find((x) => x.url.split('#')[0] === k);
      if (ex) {
        ex.w = ex.w || v.w; ex.h = ex.h || v.h; ex.bytes = ex.bytes || v.bytes; ex.mime = ex.mime || v.mime;
        if (!ex.label || ex.label === 'Görüntülenen') ex.label = v.label || ex.label;
      } else target.variants.push(v);
      if (S.dedupe) byUrl.set(k, target);
    }
  }
  for (const it of out) {
    for (const v of it.variants) {
      v.ext = extOf(v);
      if (v.url.startsWith('data:')) v.bytes = Math.round((v.url.length - v.url.indexOf(',') - 1) * 0.75);
    }
    if (it.variants.some((v) => VIDEO_EXTS.has(v.ext))) it.type = 'video';
    choose(it);
  }
  return out;
}

// Kalite tercihine göre varyant seç
function choose(it) {
  if (it.manual) return;
  const sorted = it.variants.map((v, i) => ({ v, i })).sort((a, b) => cmpVariant(a.v, b.v));
  let pick = sorted[0];
  if (S.quality === 'min') {
    const known = sorted.filter((x) => area(x.v) > 0);
    pick = known.length ? known[known.length - 1] : sorted[sorted.length - 1];
  } else if (S.quality !== 'max') {
    const t = +S.quality;
    pick = sorted.find((x) => shortSide(x.v) && shortSide(x.v) <= t) || sorted.filter((x) => shortSide(x.v)).pop() || sorted[0];
  }
  it.chosen = pick.i;
}
const cur = (it) => it.variants[it.chosen];

// ---------------- ölçme (boyut + dosya boyutu) ----------------
function limiter(n) {
  let running = 0;
  const q = [];
  const next = () => {
    if (running >= n || !q.length) return;
    running++;
    const { fn, res } = q.shift();
    fn().then(res, res).finally(() => { running--; next(); });
  };
  return (fn) => new Promise((res) => { q.push({ fn, res }); next(); });
}
const dimLimit = limiter(8);
const headLimit = limiter(6);
let scanToken = 0;

function measureDims(v, type) {
  return new Promise((res) => {
    const done = () => { clearTimeout(t); res(); };
    const t = setTimeout(done, 12000);
    if (type === 'video') {
      const el = document.createElement('video');
      el.preload = 'metadata'; el.muted = true;
      el.onloadedmetadata = () => { v.w = el.videoWidth || v.w; v.h = el.videoHeight || v.h; el.removeAttribute('src'); el.load(); done(); };
      el.onerror = done;
      el.src = v.url;
    } else {
      const im = new Image();
      im.onload = () => { v.w = im.naturalWidth || v.w; v.h = im.naturalHeight || v.h; done(); };
      im.onerror = done;
      im.src = v.url;
    }
  });
}
async function measureBytes(v) {
  if (v.bytes || v.url.startsWith('data:')) return;
  try {
    const r = await fetch(v.url, { method: 'HEAD', credentials: 'include' });
    const cl = +r.headers.get('content-length');
    if (r.ok && cl) v.bytes = cl;
    const ct = r.headers.get('content-type');
    if (ct && !v.mime) { v.mime = ct; const e = extOf(v); if (e) v.ext = e; }
  } catch {}
}

async function enrich() {
  const token = ++scanToken;
  const jobs = [];
  for (const it of items) {
    for (const v of it.variants) {
      const needDims = !(v.w && v.h) && (it.variants.length > 1 || v === cur(it));
      if (needDims && jobs.length < 900) {
        jobs.push(dimLimit(async () => {
          if (token !== scanToken) return;
          await measureDims(v, it.type);
          choose(it); updateCard(it);
        }));
      }
    }
  }
  await Promise.all(jobs);
  if (token !== scanToken) return;
  applyView(true);
  // Dosya boyutları: önce seçili varyantlar, sonra diğerleri
  const order = [...items.map((it) => cur(it)), ...items.flatMap((it) => it.variants.filter((v) => v !== cur(it)))];
  const owner = new Map(items.flatMap((it) => it.variants.map((v) => [v, it])));
  await Promise.all(order.slice(0, 800).map((v) => headLimit(async () => {
    if (token !== scanToken) return;
    await measureBytes(v);
    updateCard(owner.get(v));
  })));
  if (token === scanToken) updateSummary();
}

// ---------------- görünüm ----------------
function variantLabel(v) {
  return [dims(v) || '? boyut', fmtBytes(v.bytes), (v.ext || '').toUpperCase(), v.label].filter(Boolean).join(' · ');
}

function makeCard(it) {
  const el = document.createElement('div');
  el.className = 'card';
  el.dataset.id = it.id;
  const thumbUrl = it.type === 'image' ? cur(it).url : it.thumb;
  const thumb = thumbUrl
    ? `<img loading="lazy" referrerpolicy="no-referrer" src="${esc(thumbUrl)}" alt="">`
    : it.type === 'video' ? `<video muted preload="metadata" src="${esc(cur(it).url)}#t=0.5"></video>` : '<span class="vid">🖼</span>';
  el.innerHTML = `
    <input type="checkbox" class="chk">
    <div class="badges"><span class="t-${it.type}">${it.type === 'video' ? 'VİDEO' : 'RESİM'}</span><span class="ext"></span></div>
    <div class="thumb">${thumb}</div>
    <div class="info">
      <div class="meta"><span class="dims"></span><span class="size"></span></div>
      <div class="name"></div>
      <select class="variant" title="Kalite / sürüm seçin"></select>
      <div class="row"><button class="open" title="Yeni sekmede aç">Aç ↗</button><button class="one" title="Sadece bunu indir">İndir ⬇</button></div>
    </div>`;
  const img = el.querySelector('.thumb img');
  if (img) img.onerror = () => { img.replaceWith(Object.assign(document.createElement('span'), { className: 'vid', textContent: it.type === 'video' ? '🎬' : '🖼' })); };
  const vid = el.querySelector('.thumb video');
  if (vid) vid.onerror = () => vid.replaceWith(Object.assign(document.createElement('span'), { className: 'vid', textContent: '🎬' }));
  it.el = el;
  updateCard(it);
  return el;
}

function updateCard(it) {
  const el = it && it.el;
  if (!el) return;
  const v = cur(it);
  el.classList.toggle('sel', it.selected);
  el.querySelector('.chk').checked = it.selected;
  el.querySelector('.ext').textContent = (v.ext || '?').toUpperCase();
  el.querySelector('.dims').textContent = dims(v) || '—';
  el.querySelector('.size').textContent = fmtBytes(v.bytes);
  const nm = nameOf(v) || it.alt || hostOf(it.tab.url);
  el.querySelector('.name').textContent = nm;
  el.querySelector('.name').title = `${v.url}\n\nSekme: ${it.tab.title}`;
  const sel = el.querySelector('.variant');
  sel.style.display = it.variants.length > 1 ? '' : 'none';
  if (it.variants.length > 1 && document.activeElement !== sel) {
    const opts = it.variants.map((x, i) => ({ x, i })).sort((a, b) => cmpVariant(a.x, b.x));
    sel.innerHTML = opts.map(({ x, i }) => `<option value="${i}"${i === it.chosen ? ' selected' : ''}>${esc(variantLabel(x))}</option>`).join('');
  }
  if (!applyFilterOne(it)) el.style.display = 'none';
  else el.style.display = '';
}

function passes(it) {
  const v = cur(it);
  if (it.type === 'image' && !S.showImages) return false;
  if (it.type === 'video' && !S.showVideos) return false;
  if (v.w && v.w < S.minW && it.type === 'image') return false;
  if (v.h && v.h < S.minH && it.type === 'image') return false;
  if (S.offFormats.includes(v.ext || '?')) return false;
  const q = $('#search').value.trim().toLowerCase();
  if (q && !`${v.url} ${it.alt} ${it.tab.title} ${it.tab.url}`.toLowerCase().includes(q)) return false;
  return true;
}
const applyFilterOne = (it) => (it.visible = passes(it));

function sortItems() {
  const by = {
    area: (a, b) => (area(cur(b)) - area(cur(a))) || ((cur(b).bytes || 0) - (cur(a).bytes || 0)),
    bytes: (a, b) => ((cur(b).bytes || 0) - (cur(a).bytes || 0)) || (area(cur(b)) - area(cur(a))),
    page: (a, b) => a.order - b.order,
    type: (a, b) => (a.type === b.type ? 0 : a.type === 'video' ? -1 : 1) || (area(cur(b)) - area(cur(a))),
  }[S.sort];
  return [...items].sort(by);
}

function renderAll() {
  const grid = $('#grid');
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<div class="empty">Medya bulunamadı.</div>';
    renderFormats(); updateSummary();
    return;
  }
  const frag = document.createDocumentFragment();
  for (const it of sortItems()) frag.appendChild(it.el || makeCard(it));
  grid.appendChild(frag);
  applyView(false);
}

// Filtre/sıralama: kartları yeniden oluşturmadan göster/gizle ve yeniden diz
function applyView(resort) {
  if (!items.length) return;
  const grid = $('#grid');
  if (resort) for (const it of sortItems()) if (it.el) grid.appendChild(it.el);
  let shown = 0;
  for (const it of items) { if (it.el) { const ok = applyFilterOne(it); it.el.style.display = ok ? '' : 'none'; if (ok) shown++; } }
  let empty = grid.querySelector('.empty');
  if (!shown && !empty) { empty = Object.assign(document.createElement('div'), { className: 'empty', textContent: 'Filtrelere uyan medya yok.' }); grid.prepend(empty); }
  if (shown && empty) empty.remove();
  renderFormats();
  updateSummary();
}

function renderFormats() {
  const counts = {};
  for (const it of items) { const e = cur(it).ext || '?'; counts[e] = (counts[e] || 0) + 1; }
  $('#formats').innerHTML = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `<span class="fmt${S.offFormats.includes(e) ? '' : ' on'}" data-ext="${esc(e)}" title="Bu formatı göster/gizle">${esc(e.toUpperCase())} ${n}</span>`).join('');
  $('#cntImg').textContent = items.filter((i) => i.type === 'image').length;
  $('#cntVid').textContent = items.filter((i) => i.type === 'video').length;
}

function selectedVisible() { return sortItems().filter((it) => it.selected && it.visible); }

function updateSummary() {
  const sel = selectedVisible();
  const total = sel.reduce((s, it) => s + (cur(it).bytes || 0), 0);
  const unknown = sel.some((it) => !cur(it).bytes);
  const visible = items.filter((i) => i.visible).length;
  $('#summary').textContent = `${sel.length} seçili / ${visible} görünen` + (total ? ` · ${unknown ? '~' : ''}${fmtBytes(total)}` : '');
  $('#download').disabled = !sel.length;
  $('#download').textContent = sel.length ? `İndir (${sel.length})` : 'İndir';
}

// ---------------- indirme ----------------
function buildJob(it, index) {
  const v = cur(it);
  const site = clean(hostOf(it.tab.url), 60);
  const date = new Date().toISOString().slice(0, 10);
  const folder = S.folder.replace(/\{site\}/g, site).replace(/\{date\}/g, date).replace(/\{title\}/g, clean(it.tab.title, 60))
    .split(/[\\/]+/).filter(Boolean).map((s) => clean(s, 80)).join('/');
  const num = String(index + 1).padStart(3, '0');
  let base;
  if (S.naming === 'site') base = `${site}_${num}`;
  else if (S.naming === 'title') base = `${clean(it.tab.title, 60)}_${num}`;
  else base = nameOf(v) ? clean(nameOf(v), 100) : `${it.type === 'video' ? 'video' : 'resim'}_${num}`;
  const origExt = v.ext && /^[a-z0-9]{2,5}$/.test(v.ext) ? v.ext : it.type === 'video' ? 'mp4' : 'jpg';
  const convertible = it.type === 'image' && S.convert !== 'original' && origExt !== S.convert && origExt !== 'svg' && origExt !== 'gif';
  const ext = convertible ? S.convert : origExt;
  const path = (f, e) => (f ? f + '/' : '') + `${base}.${e}`;
  return { url: v.url, filename: path(folder, ext), fallbackFilename: path(folder, origExt), convert: convertible ? S.convert : null };
}

async function startDownload(list) {
  if (!list.length) return;
  const jobs = list.map(buildJob);
  const saveAs = S.saveAs && jobs.length === 1;
  if (S.saveAs && jobs.length > 1 && !confirm(`${jobs.length} dosya için tek tek konum sorulmayacak; hepsi "${S.folder}" klasörüne kaydedilecek. Devam edilsin mi?`)) return;
  await chrome.runtime.sendMessage({ type: 'download', jobs, options: { saveAs, quality: S.jpgQuality, parallel: S.parallel || 3 } });
  showProgress({ done: 0, failed: 0, total: jobs.length });
}

function showProgress({ done, failed, total, errors }) {
  const p = $('#progress');
  p.hidden = false;
  p.querySelector('div').style.width = `${((done + failed) / total) * 100}%`;
  p.querySelector('span').textContent = done + failed < total ? `${done + failed}/${total} indiriliyor…` : failed ? `${done} tamam, ${failed} hata` : `${done} dosya indirildi ✓`;
  if (errors && errors.length) p.title = errors.join('\n');
}
chrome.runtime.onMessage.addListener((m) => { if (m.type === 'progress') showProgress(m); });

// ---------------- olaylar ----------------
$('#grid').addEventListener('click', (e) => {
  const card = e.target.closest('.card');
  if (!card) return;
  const it = items[+card.dataset.id];
  if (e.target.closest('.variant')) return;
  if (e.target.closest('.open')) { chrome.tabs.create({ url: cur(it).url, active: false }); return; }
  if (e.target.closest('.one')) { startDownload([it]); return; }
  const val = e.target.classList.contains('chk') ? e.target.checked : !it.selected;
  if (e.shiftKey && lastClicked != null) {
    // Shift ile aralık seçimi
    const vis = [...$('#grid').querySelectorAll('.card')].filter((c) => c.style.display !== 'none').map((c) => items[+c.dataset.id]);
    const a = vis.indexOf(items[lastClicked]), b = vis.indexOf(it);
    if (a >= 0 && b >= 0) for (const x of vis.slice(Math.min(a, b), Math.max(a, b) + 1)) { x.selected = val; updateCard(x); }
  } else { it.selected = val; updateCard(it); }
  lastClicked = it.id;
  updateSummary();
});
$('#grid').addEventListener('change', (e) => {
  if (!e.target.classList.contains('variant')) return;
  const it = items[+e.target.closest('.card').dataset.id];
  it.chosen = +e.target.value;
  it.manual = true;
  it.selected = true;
  e.target.blur();
  updateCard(it);
  measureBytes(cur(it)).then(() => { updateCard(it); updateSummary(); });
  updateSummary();
});
$('#formats').addEventListener('click', (e) => {
  const f = e.target.closest('.fmt');
  if (!f) return;
  const ext = f.dataset.ext;
  S.offFormats = S.offFormats.includes(ext) ? S.offFormats.filter((x) => x !== ext) : [...S.offFormats, ext];
  saveSettings();
  applyView(false);
});

const setAll = (fn) => { for (const it of items) if (it.visible) { it.selected = fn(it); updateCard(it); } updateSummary(); };
$('#selAll').onclick = () => setAll(() => true);
$('#selNone').onclick = () => setAll(() => false);
$('#selInvert').onclick = () => setAll((it) => !it.selected);
$('#scan').onclick = scan;
$('#download').onclick = () => startDownload(selectedVisible());
$('#copy').onclick = async () => {
  const list = selectedVisible().length ? selectedVisible() : items.filter((i) => i.visible);
  await navigator.clipboard.writeText(list.map((it) => cur(it).url).join('\n'));
  $('#copy').textContent = `${list.length} link kopyalandı ✓`;
  setTimeout(() => ($('#copy').textContent = 'Linkleri kopyala'), 1800);
};
$('#toggleSettings').onclick = () => { $('#settings').hidden = !$('#settings').hidden; };
$('#detach').onclick = async () => {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.windows.create({ url: `popup.html?tab=${t ? t.id : ''}`, type: 'popup', width: 1100, height: 780 });
  window.close();
};
if (DETACHED) $('#detach').hidden = true;
$('#search').addEventListener('input', () => applyView(false));

bindSetting('scope', 'text', scan);
bindSetting('showImages', 'check', () => applyView(false));
bindSetting('showVideos', 'check', () => applyView(false));
bindSetting('minW', 'num', () => applyView(false));
bindSetting('minH', 'num', () => applyView(false));
bindSetting('quality', 'text', () => { for (const it of items) { it.manual = false; choose(it); updateCard(it); } applyView(true); });
bindSetting('sort', 'text', () => applyView(true));
bindSetting('convert', 'text', () => { $('#qWrap').style.display = S.convert === 'jpg' || S.convert === 'webp' ? '' : 'none'; });
bindSetting('jpgQuality', 'num', () => { $('#jpgQualityVal').textContent = S.jpgQuality; });
bindSetting('folder', 'text');
bindSetting('naming', 'text');
bindSetting('parallel', 'num');
bindSetting('saveAs', 'check');
bindSetting('dedupe', 'check', scan);

loadSettings().then(scan);
