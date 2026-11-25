"""Client du système externe CNSS.

Par défaut on utilise une simulation interne (mock). Si CNSS_API_URL est défini,
les appels partent en HTTP vers ce serveur (même contrat JSON).
"""
import hashlib

import requests
from flask import current_app

_FIRST = ["Ahmed", "Mohamed", "Sami", "Youssef", "Amine", "Fatma", "Salma", "Mariem", "Nour", "Ines"]
_LAST = ["Ben Salah", "Trabelsi", "Gharbi", "Jlassi", "Mansouri", "Hammami", "Bouazizi", "Khelifi"]
_CITIES = ["Nabeul", "Sousse", "Tunis", "Hammamet", "Sfax", "Monastir"]


def mock_validate(card_number: str) -> dict:
    """Règle de la simulation : commence par 1 = valide, 0 = expirée, sinon invalide."""
    card_number = (card_number or "").strip()
    if not card_number.isdigit() or len(card_number) < 6:
        return {"status": "invalid", "error": "Numéro de carte invalide"}
    if card_number[0] == "1":
        h = int(hashlib.sha256(card_number.encode()).hexdigest(), 16)
        return {
            "status": "valid",
            "patient_data": {
                "first_name": _FIRST[h % len(_FIRST)],
                "last_name": _LAST[(h >> 8) % len(_LAST)],
                "address": f"{(h >> 16) % 90 + 1} rue de la République, {_CITIES[(h >> 24) % len(_CITIES)]}",
                "phone": f"{[20, 22, 50, 55, 98][(h >> 32) % 5]}{(h >> 40) % 900000 + 100000}",
            },
        }
    if card_number[0] == "0":
        return {"status": "expired", "error": "Carte expirée : veuillez la renouveler"}
    return {"status": "invalid", "error": "Numéro de carte invalide"}


def mock_receive_bill(payload: dict) -> dict:
    ref = hashlib.sha1(repr(sorted(payload["cnss_numbers"])).encode()).hexdigest()[:10].upper()
    return {"status": "accepted", "reference": f"CNSS-{ref}"}


def validate(card_number: str) -> dict:
    base = current_app.config.get("CNSS_API_URL")
    if not base:
        return mock_validate(card_number)
    try:
        r = requests.get(f"{base}/api/cnss/validate/{card_number}", timeout=5)
        return r.json()
    except (requests.RequestException, ValueError):
        return {"status": "unavailable", "error": "Système CNSS injoignable"}


def send_bill(payload: dict) -> dict:
    base = current_app.config.get("CNSS_API_URL")
    if not base:
        return mock_receive_bill(payload)
    try:
        r = requests.post(f"{base}/api/cnss/bills", json=payload, timeout=10)
        return r.json()
    except (requests.RequestException, ValueError):
        return {"status": "unavailable"}
