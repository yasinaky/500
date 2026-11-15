"""Videodaki örneğin benzeri: bir dosyadaki postları/mesajları Jev ile toplu analiz eder.

Dosya biçimi: her post arasında BOŞ BİR SATIR olan düz metin (.txt).

Çalıştırma:
    export TYPESAFE_API_KEY="anahtarin"
    .venv/bin/python analiz.py postlar.txt            # sonuç: postlar.sonuc.csv

Soruları değiştirmek için yalnızca aşağıdaki SORULAR bölümünü düzenle.
"""

import asyncio
import csv
import sys
import time
from pathlib import Path

from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul, Score

# ---------------- SORULAR (hepsi tek yerde) ----------------
SORULAR = {
    "konu": Choice(
        instructions="What is this post mainly about?",
        criteria={
            "success_story": "The author shares a result, sale, or milestone they achieved",
            "question": "The author asks for help or information",
            "thanks": "The author mainly thanks the community or someone",
            "announcement": "The author announces or shares something for others",
            "other": "Something else",
        },
    ),
    "duygu": Score(
        instructions="How positive is the author's mood?",
        criteria=[
            "The author sounds frustrated or discouraged",
            "The author sounds neutral",
            "The author sounds happy or excited",
        ],
    ),
    "takildi_mi": Noul(
        instructions="The author describes being stuck on a specific problem",
        criteria={
            "true": "The author names a concrete problem they cannot solve yet",
            "false": "The author is not describing an unsolved problem",
        },
    ),
}
# -----------------------------------------------------------

AYNI_ANDA = 20  # eşzamanlı istek sayısı


async def main(path: Path) -> None:
    posts = [p.strip() for p in path.read_text(encoding="utf-8").split("\n\n") if p.strip()]
    print(f"{len(posts)} post bulundu, Jev'e gönderiliyor...")

    sem = asyncio.Semaphore(AYNI_ANDA)
    async with AsyncTypeSafeClient(model="jev-latest") as client:

        async def one(text: str):
            async with sem:
                return await client.system_one(state={"post": text}, questions=SORULAR)

        start = time.perf_counter()
        results = await asyncio.gather(*(one(p) for p in posts))
        elapsed = time.perf_counter() - start

    out = path.with_suffix(".sonuc.csv")
    total_in = 0
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["post", "konu", "konu_olasilik", "duygu_0_2", "takildi_mi_olasilik"])
        for text, r in zip(posts, results):
            c = r.choices["konu"]
            w.writerow([
                text[:200],
                c.choice,
                round(c.probabilities[c.choice], 2),
                round(r.scores["duygu"].score, 2),
                round(r.nouls["takildi_mi"].noul, 2),
            ])
            total_in += r.usage.input_tokens or 0

    counts: dict[str, int] = {}
    for r in results:
        counts[r.choices["konu"].choice] = counts.get(r.choices["konu"].choice, 0) + 1
    print(f"Bitti: {elapsed:.1f} sn, {total_in:,} giriş token'ı "
          f"(~${total_in * 0.042 / 1_000_000:.4f})")
    print("Konu dağılımı:", dict(sorted(counts.items(), key=lambda kv: -kv[1])))
    print("Sonuç dosyası:", out)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Kullanım: .venv/bin/python analiz.py postlar.txt")
    asyncio.run(main(Path(sys.argv[1])))
