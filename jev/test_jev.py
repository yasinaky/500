"""Jev bağlantı testi: resmi quickstart örneği (destek talebi yönlendirme).

Çalıştırma:
    export TYPESAFE_API_KEY="anahtarin"
    .venv/bin/python test_jev.py
"""

import time

from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

TICKET = (
    "Our API integration started returning 500 errors on every request about "
    "20 minutes ago, and we can't process any customer orders until this is fixed."
)

with TypeSafeClient(model="jev-latest") as client:  # TYPESAFE_API_KEY'i okur
    start = time.perf_counter()
    response = client.system_one(
        state=TICKET,
        questions={
            "department": Choice(
                instructions="Which team should handle this",
                criteria={
                    "billing": "Payment or subscription issues",
                    "technical": "Bugs or integration problems",
                    "sales": "Pricing or account questions",
                },
            ),
            "frustration": Score(
                instructions="How frustrated the customer appears",
                criteria=[
                    "Calm, just stating facts",
                    "Frustrated but civil",
                    "Very angry, strong language",
                ],
            ),
            "is_urgent": Noul(
                instructions="The message conveys urgency or time-sensitivity",
            ),
        },
    )
    elapsed = time.perf_counter() - start

print("Model      :", response.model)
print("Ekip       :", response.choices["department"].choice)
print("Öfke (0-2) :", response.scores["frustration"].score)
print("Acil mi    :", response.nouls["is_urgent"].noul)
print(f"Süre       : {elapsed:.2f} sn")
print("Token      :", response.usage)
