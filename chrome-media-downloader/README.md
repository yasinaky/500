# Medya İndirici – Chrome Uzantısı

Açık sekmedeki **veya tüm sekmelerdeki** resim ve videoları bulur, **indirmeden önce** hangilerini ve hangi **kalitede** indireceğinizi seçmenizi sağlar.

## Kurulum
1. Bu `chrome-media-downloader` klasörünü bilgisayarınıza indirin (veya zip'i açın).
2. Chrome'da `chrome://extensions` adresini açın.
3. Sağ üstten **Geliştirici modu**'nu açın.
4. **Paketlenmemiş öğe yükle** → `chrome-media-downloader` klasörünü seçin.
5. Uzantıyı araç çubuğuna sabitleyin (yapboz simgesi → 📌).

## Kullanım
1. Simgeye tıklayın → otomatik tarar.
2. Üstten kapsamı seçin: **Bu sekme / Bu penceredeki tüm sekmeler / Tüm pencereler**.
3. Kartlara tıklayarak seçin (Shift+tık ile aralık seçimi). **Tümünü seç / Hiçbiri / Ters çevir**.
4. Her kartın altındaki açılır listeden **kaliteyi** seçin (ör. `1600×1200 · 30 KB · JPG`), ya da üstteki **Kalite** menüsüyle hepsine aynı anda uygulayın: En yüksek, ≤4K, ≤1080p, ≤720p … En düşük.
5. **İndir (N)**.

## Özellikler
- Resimler: `<img>`, `srcset`/`<picture>` (tüm boyutlar), gecikmeli yüklenen (`data-src` …), bağlantılı tam boy resimler, CSS arka planları, og:image, iframe içleri.
- Videolar: `<video>`/`<source>` (720p, 360p gibi sürümler), og:video, doğrudan video bağlantıları ve **oynatılırken ağdan yakalanan** video dosyaları.
- Gerçek çözünürlük ve dosya boyutu ölçülür; tahmini toplam boyut gösterilir.
- Filtreler: tür, en küçük genişlik/yükseklik, format (JPG/PNG/WEBP/MP4…), arama; sıralama.
- Ayarlar (⚙): klasör şablonu (`{site}`, `{date}`, `{title}`), dosya adı biçimi, **JPG/PNG/WEBP'ye dönüştürme** (kalite ayarlı), aynı anda indirme sayısı, konum sorma, kopyaları birleştirme.
- Linkleri panoya kopyalama, tek dosya indirme, yeni sekmede açma, büyük pencere modu (⤢), sağ tık → "Medya İndirici ile indir".

## Sınırlamalar
- `chrome://` ve Chrome Web Mağazası sayfaları taranamaz; uyku modundaki sekmeleri bir kez açmak gerekir.
- YouTube, Netflix vb. akış (blob/HLS/DASH) videoları parçalı geldiği için doğrudan indirilemez.
- Yalnızca indirme hakkınız olan içerikleri indirin.
