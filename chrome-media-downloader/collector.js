// Sayfaya (ve tüm iframe'lere) enjekte edilir. Son ifadenin değeri popup'a döner.
(() => {
  const IMG_EXT = /\.(jpe?g|jfif|png|gif|webp|avif|bmp|svg|ico|tiff?|heic)(?:[?#]|$)/i;
  const VID_EXT = /\.(mp4|webm|mov|m4v|mkv|ogv|avi|3gp)(?:[?#]|$)/i;
  const LAZY_ATTRS = ['data-src', 'data-original', 'data-lazy-src', 'data-lazy', 'data-full', 'data-full-src',
    'data-large', 'data-large-src', 'data-hi-res', 'data-hires', 'data-zoom-image', 'data-zoom', 'data-big', 'data-orig-file', 'data-large-file'];

  const items = [];
  let blobVideos = 0;

  const abs = (u) => {
    if (!u) return null;
    u = String(u).trim();
    if (!u) return null;
    try {
      const x = new URL(u, document.baseURI);
      if (!/^(https?|data|file):$/.test(x.protocol)) return null;
      if (x.protocol === 'data:' && !/^data:(image|video)\//i.test(u)) return null;
      return x.href;
    } catch { return null; }
  };

  // HTML spesifikasyonuna yakın srcset ayrıştırıcı (URL içindeki virgülleri bozmaz)
  function parseSrcset(str) {
    const out = [];
    if (!str) return out;
    let i = 0;
    const n = str.length;
    while (i < n) {
      while (i < n && /[\s,]/.test(str[i])) i++;
      if (i >= n) break;
      let start = i;
      while (i < n && !/\s/.test(str[i])) i++;
      let url = str.slice(start, i);
      let desc = '';
      if (/,$/.test(url)) {
        url = url.replace(/,+$/, '');
      } else {
        start = i;
        let depth = 0;
        while (i < n) {
          const c = str[i];
          if (c === '(') depth++;
          else if (c === ')') depth--;
          else if (c === ',' && depth <= 0) break;
          i++;
        }
        desc = str.slice(start, i).trim();
      }
      const m = desc.match(/(\d+(?:\.\d+)?)([wx])/);
      out.push({ url, w: m && m[2] === 'w' ? Math.round(+m[1]) : null, x: m && m[2] === 'x' ? +m[1] : null });
    }
    return out;
  }

  // ---------- RESİMLER ----------
  for (const img of document.images) {
    const variants = [];
    const nw = img.naturalWidth || null;
    const nh = img.naturalHeight || null;
    const ratio = nw && nh ? nh / nw : null;
    const cur = abs(img.currentSrc || img.src);
    if (cur) variants.push({ url: cur, w: nw, h: nh, label: 'Görüntülenen' });

    const srcsets = [img.getAttribute('srcset'), img.getAttribute('data-srcset'), img.getAttribute('data-lazy-srcset')];
    const pic = img.parentElement && img.parentElement.tagName === 'PICTURE' ? img.parentElement : null;
    if (pic) for (const s of pic.querySelectorAll('source')) srcsets.push(s.getAttribute('srcset'), s.getAttribute('data-srcset'));
    for (const ss of srcsets) {
      for (const c of parseSrcset(ss)) {
        const u = abs(c.url);
        if (!u) continue;
        let w = c.w;
        if (!w && c.x && nw) w = null; // x tanımlayıcı: boyut popup'ta ölçülür
        variants.push({ url: u, w, h: w && ratio ? Math.round(w * ratio) : null, label: c.w ? c.w + 'w' : c.x ? c.x + 'x' : null });
      }
    }
    for (const a of LAZY_ATTRS) {
      const u = abs(img.getAttribute(a));
      if (u) variants.push({ url: u, label: 'Gecikmeli yükleme' });
    }
    // Resim bir bağlantının içindeyse ve bağlantı bir resim dosyasıysa → çoğu zaman tam boy hali
    const link = img.closest('a[href]');
    if (link) {
      const u = abs(link.getAttribute('href'));
      if (u && IMG_EXT.test(u)) variants.push({ url: u, label: 'Bağlantılı tam boy' });
    }
    if (variants.length) items.push({ type: 'image', variants, thumb: cur, alt: img.alt || img.title || '' });
  }

  // CSS arka plan resimleri
  const all = document.querySelectorAll('body *');
  const limit = Math.min(all.length, 6000);
  for (let i = 0; i < limit; i++) {
    const el = all[i];
    const bg = getComputedStyle(el).backgroundImage;
    if (!bg || bg === 'none' || !bg.includes('url(')) continue;
    for (const m of bg.matchAll(/url\((['"]?)(.*?)\1\)/g)) {
      const u = abs(m[2]);
      if (u) items.push({ type: 'image', variants: [{ url: u, label: 'Arka plan' }], thumb: u, alt: '' });
    }
  }

  // SVG <image>
  for (const im of document.querySelectorAll('svg image')) {
    const u = abs(im.getAttribute('href') || im.getAttribute('xlink:href'));
    if (u) items.push({ type: 'image', variants: [{ url: u }], thumb: u, alt: '' });
  }

  // Meta etiketleri (paylaşım görselleri genelde yüksek çözünürlüklüdür)
  const metaSel = 'meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"],meta[name="twitter:image:src"],meta[itemprop="image"]';
  for (const m of document.querySelectorAll(metaSel)) {
    const u = abs(m.getAttribute('content'));
    if (u) items.push({ type: 'image', variants: [{ url: u, label: 'Paylaşım görseli' }], thumb: u, alt: 'og:image' });
  }
  for (const l of document.querySelectorAll('link[rel="image_src"]')) {
    const u = abs(l.getAttribute('href'));
    if (u) items.push({ type: 'image', variants: [{ url: u }], thumb: u, alt: '' });
  }

  // ---------- VİDEOLAR ----------
  for (const v of document.querySelectorAll('video')) {
    const variants = [];
    const cur = abs(v.currentSrc || v.src) || null;
    const rawCur = v.currentSrc || v.src || '';
    if (rawCur.startsWith('blob:')) blobVideos++;
    if (cur) variants.push({ url: cur, w: v.videoWidth || null, h: v.videoHeight || null, label: 'Oynatılan' });
    for (const s of v.querySelectorAll('source')) {
      const u = abs(s.getAttribute('src'));
      if (!u) continue;
      const q = s.getAttribute('size') || s.getAttribute('res') || s.getAttribute('label') ||
        s.getAttribute('data-quality') || s.getAttribute('data-res') || s.getAttribute('title') || '';
      const hm = String(q).match(/(\d{3,4})/);
      variants.push({ url: u, h: hm ? +hm[1] : null, label: q || null, mime: s.getAttribute('type') || null });
    }
    for (const a of ['data-src', 'data-video', 'data-video-src', 'data-hd', 'data-sd']) {
      const u = abs(v.getAttribute(a));
      if (u) variants.push({ url: u, label: a.replace('data-', '') });
    }
    const poster = abs(v.getAttribute('poster'));
    if (variants.length) items.push({ type: 'video', variants, thumb: poster, alt: v.title || '' });
    if (poster) items.push({ type: 'image', variants: [{ url: poster, label: 'Video kapağı' }], thumb: poster, alt: 'Video kapağı' });
  }
  for (const m of document.querySelectorAll('meta[property="og:video"],meta[property="og:video:url"],meta[property="og:video:secure_url"]')) {
    const u = abs(m.getAttribute('content'));
    if (u && VID_EXT.test(u)) items.push({ type: 'video', variants: [{ url: u, label: 'og:video' }], thumb: null, alt: '' });
  }

  // Bağlantılar doğrudan medya dosyasına işaret ediyorsa
  for (const a of document.querySelectorAll('a[href]')) {
    const u = abs(a.getAttribute('href'));
    if (!u || u.startsWith('data:')) continue;
    if (VID_EXT.test(u)) items.push({ type: 'video', variants: [{ url: u, label: 'Bağlantı' }], thumb: null, alt: a.textContent.trim().slice(0, 80) });
    else if (IMG_EXT.test(u)) items.push({ type: 'image', variants: [{ url: u, label: 'Bağlantı' }], thumb: u, alt: a.textContent.trim().slice(0, 80) });
  }

  return { url: location.href, title: document.title, items, blobVideos };
})();
