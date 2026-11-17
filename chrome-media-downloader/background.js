// Arka plan servis çalışanı:
//  1) Sekmelerin ağ trafiğinden doğrudan video dosyalarını yakalar (sayfada <video src> görünmeyenler için)
//  2) İndirme kuyruğunu çalıştırır (isteğe bağlı resim formatı dönüştürme ile)
//  3) Sağ tık menüsü

const VID_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv|avi|3gp)(?:[?#]|$)/i;
const STREAM_RE = /\.(ts|m4s|m3u8|mpd|aac|m4a)(?:[?#]|$)/i;

const net = new Map(); // tabId -> Map(url -> {url, mime, bytes})
const ready = chrome.storage.session.get('net').then((d) => {
  if (d.net) for (const [k, v] of Object.entries(d.net)) net.set(+k, new Map(v));
}).catch(() => {});

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const o = {};
    for (const [k, m] of net) o[k] = [...m];
    chrome.storage.session.set({ net: o }).catch(() => {});
  }, 400);
}

const hdr = (headers, name) => {
  const h = headers && headers.find((x) => x.name.toLowerCase() === name);
  return h ? h.value : '';
};

chrome.webRequest.onHeadersReceived.addListener((d) => {
  if (d.tabId < 0 || (d.statusCode !== 200 && d.statusCode !== 206)) return;
  const ct = hdr(d.responseHeaders, 'content-type').toLowerCase().split(';')[0].trim();
  if (STREAM_RE.test(d.url) || ct === 'video/mp2t' || ct.includes('mpegurl') || ct.includes('dash') || ct.includes('iso.segment')) return;
  const isVideo = ct.startsWith('video/') || (VID_EXT.test(d.url) && (!ct || ct === 'application/octet-stream' || ct === 'binary/octet-stream'));
  if (!isVideo) return;
  // XHR ile gelen 206 parçaları çoğunlukla MSE akış parçalarıdır; tek başına oynatılamaz
  if (d.type === 'xmlhttprequest' && d.statusCode === 206) return;
  let bytes = 0;
  const cr = hdr(d.responseHeaders, 'content-range').match(/\/(\d+)\s*$/);
  if (cr) bytes = +cr[1];
  else bytes = +hdr(d.responseHeaders, 'content-length') || 0;
  if (bytes && bytes < 30 * 1024) return;

  ready.then(() => {
    let m = net.get(d.tabId);
    if (!m) net.set(d.tabId, (m = new Map()));
    if (m.size >= 300 && !m.has(d.url)) return;
    const prev = m.get(d.url);
    m.set(d.url, { url: d.url, mime: ct || null, bytes: Math.max(bytes, (prev && prev.bytes) || 0) });
    persist();
  });
}, { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'object', 'other'] }, ['responseHeaders']);

chrome.tabs.onRemoved.addListener((id) => { ready.then(() => { if (net.delete(id)) persist(); }); });
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'loading' && info.url) ready.then(() => { if (net.delete(id)) persist(); });
});

// ---------- İndirme ----------
const MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

async function convertImage(url, fmt, quality) {
  const resp = await fetch(url, { credentials: 'include' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const bmp = await createImageBitmap(await resp.blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d');
  if (fmt === 'jpg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const out = await c.convertToBlob({ type: MIME[fmt], quality: quality / 100 });
  return blobToDataURL(out);
}

async function downloadOne(job, opt) {
  let url = job.url;
  let filename = job.filename;
  if (job.convert) {
    try { url = await convertImage(job.url, job.convert, opt.quality || 92); }
    catch { url = job.url; filename = job.fallbackFilename || filename; } // dönüştürülemezse orijinali indir
  }
  try {
    await chrome.downloads.download({ url, filename, conflictAction: 'uniquify', saveAs: !!opt.saveAs });
  } catch (e) {
    // Geçersiz dosya adı vb. → güvenli bir adla tekrar dene
    const ext = (filename.match(/\.([a-z0-9]{2,5})$/i) || [, 'bin'])[1];
    await chrome.downloads.download({ url, filename: `Medya/dosya_${Date.now()}.${ext}`, conflictAction: 'uniquify', saveAs: !!opt.saveAs });
  }
}

let active = 0;
async function runJobs(jobs, opt) {
  const total = jobs.length;
  let done = 0, failed = 0;
  const errors = [];
  active += total;
  const report = () => {
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    chrome.action.setBadgeText({ text: active > 0 ? String(active) : '' });
    chrome.runtime.sendMessage({ type: 'progress', done, failed, total, errors: errors.slice(-3) }).catch(() => {});
  };
  report();
  const queue = jobs.slice();
  const worker = async () => {
    while (queue.length) {
      const j = queue.shift();
      try { await downloadOne(j, opt); done++; }
      catch (e) { failed++; errors.push(`${j.filename.split('/').pop()}: ${e.message}`); }
      active--;
      report();
    }
  };
  await Promise.all(Array.from({ length: Math.min(opt.parallel || 3, total) }, worker));
}

chrome.runtime.onMessage.addListener((msg, _sender, send) => {
  if (msg.type === 'getNetMedia') {
    ready.then(() => {
      const out = {};
      for (const id of msg.tabIds) out[id] = [...((net.get(id) || new Map()).values())];
      send(out);
    });
    return true;
  }
  if (msg.type === 'download') {
    runJobs(msg.jobs, msg.options || {});
    send({ ok: true });
  }
});

// ---------- Sağ tık menüsü ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'mdl-save', title: 'Medya İndirici ile indir', contexts: ['image', 'video'] });
  });
});
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== 'mdl-save' || !info.srcUrl || info.srcUrl.startsWith('blob:')) return;
  chrome.downloads.download({ url: info.srcUrl, conflictAction: 'uniquify' }).catch(() => {});
});
