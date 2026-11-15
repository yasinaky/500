# Jev (TypeSafe) kurulumu

Videodaki sistemin hazır hâli. Resmi doküman: https://docs.typesafe.ai

## Kendi bilgisayarında kurulum

1. API anahtarı: https://console.typesafe.ai/keys (hesap gerekiyor; kullanım için kredi yüklemek gerekebilir).
   Fiyat: giriş token'ı başına $0.042 / 1M, çıkış ücretsiz. 5$ ≈ 119M token.
2. Python ortamı (Python 3.10+):
   ```bash
   cd jev
   python3 -m venv .venv
   .venv/bin/pip install typesafe-sdk
   export TYPESAFE_API_KEY="anahtarin"
   ```
   Windows (PowerShell): `python -m venv .venv`, `.venv\Scripts\pip install typesafe-sdk`, `$env:TYPESAFE_API_KEY="anahtarin"`.
3. Test: `.venv/bin/python test_jev.py`
4. Toplu analiz (videodaki gibi): `.venv/bin/python analiz.py ornek_postlar.txt`
   - Kendi postlarını bir `.txt` dosyasına, aralarında boş satır olacak şekilde koy.
   - Soruları `analiz.py` içindeki `SORULAR` bölümünden değiştir.

## Claude Code skill'i

`.claude/skills/typesafe-ai/` içinde resmi TypeSafe skill'i var (MIT, github.com/typesafe-ai/skills).
Bu klasörde Claude Code açınca otomatik yüklenir. Örnek istek:

> TypeSafe skill'ini kullanarak postlar.txt dosyasını analiz et, insanların en çok nerede takıldığını çıkar.

Global kurmak istersen:
```bash
claude plugin marketplace add typesafe-ai/skills
claude plugin install typesafe@typesafe-ai
```
