"""Test de bout en bout : les 3 phases du sujet (SQLite temporaire, sans MySQL).

Usage : python tests/smoke_test.py
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app  # noqa: E402
from app.models import Bill, Consultation, Patient, Surgery, db  # noqa: E402
from init_db import DEMO_PASSWORD, seed  # noqa: E402

tmp = tempfile.mkdtemp()
app = create_app({
    "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp}/test.db",
    "ENABLE_SCHEDULER": False,
    "TESTING": True,
})
with app.app_context():
    seed()


def new_client(username):
    c = app.test_client()
    with c.session_transaction() as s:
        s["csrf"] = "tok"
    r = c.post("/login", data={"username": username, "password": DEMO_PASSWORD, "csrf_token": "tok"})
    assert r.status_code == 302, f"login {username} failed ({r.status_code})"
    with c.session_transaction() as s:  # le login vide la session (anti-fixation) : on réinjecte le jeton
        s["csrf"] = "tok"
    return c


def post(c, url, **data):
    return c.post(url, data={**data, "csrf_token": "tok"})


def check(cond, msg):
    print(("OK   " if cond else "FAIL ") + msg)
    if not cond:
        sys.exit(1)


reception, nurse, doctor, admin = (new_client(u) for u in ("reception1", "nurse1", "doctor1", "admin"))

# ---- Phase 1 : inscription -------------------------------------------------
r = post(reception, "/reception/", cnss_number="0123456789")
check(b"renouveler" in r.data, "carte expirée (0...) -> rejet + message de renouvellement")
r = post(reception, "/reception/", cnss_number="9999999")
check(b"rejet" in r.data.lower(), "carte invalide (9...) -> rejet")

r = post(reception, "/reception/", cnss_number="1234567890")
check(r.status_code == 302 and "card=1234567890" in r.location, "carte valide -> formulaire patient")
r = reception.get(r.location)
check(b"Nouveau patient" in r.data, "première visite : création d'un nouveau patient")
r = post(reception, "/reception/register?card=1234567890",
         first_name="Ahmed", last_name="Ben Salah", address="1 rue X, Nabeul", phone="20123456")
check(r.status_code == 302, "patient enregistré")
r = reception.get(r.location)
check(r.data.count(b"<svg") >= 2, "2 étiquettes code-barres générées (dossier + carte CNSS)")

# 2e patient (futur cas médicaments)
r = post(reception, "/reception/register?card=1555555555",
         first_name="Salma", last_name="Gharbi", address="2 rue Y", phone="55111222")
check(r.status_code == 302, "2e patient enregistré")

# ---- Phase 2 : infirmier ---------------------------------------------------
with app.app_context():
    p1 = Patient.query.filter_by(cnss_number="1234567890").one()
    p2 = Patient.query.filter_by(cnss_number="1555555555").one()
    code1, code2 = p1.dossier.barcode, p2.dossier.barcode
    cid1 = Consultation.query.filter_by(patient_id=p1.id).one().id
    cid2 = Consultation.query.filter_by(patient_id=p2.id).one().id

r = post(nurse, "/nurse/", barcode="INCONNU")
check(b"Aucun dossier" in r.data, "scan d'un code inconnu -> erreur")
r = post(nurse, "/nurse/", barcode=code1)
check(r.status_code == 302 and f"/nurse/consultation/{cid1}" in r.location, "scan du code-barres -> dossier ouvert")
r = post(nurse, f"/nurse/consultation/{cid1}", prescription_details="   ", nurse_notes="")
check(b"obligatoires" in r.data, "ordonnance vide refusée")
r = post(nurse, f"/nurse/consultation/{cid1}", prescription_details="Radio du genou", nurse_notes="TA 12/8")
check(r.status_code == 302, "ordonnance infirmier enregistrée")
post(nurse, f"/nurse/consultation/{cid2}", prescription_details="Bilan sanguin", nurse_notes="")

# ---- Phase 2 : médecin -----------------------------------------------------
r = doctor.get(f"/doctor/consultation/{cid1}")
check(b"Radio du genou" in r.data and b"TA 12/8" in r.data, "le médecin voit la saisie de l'infirmier")
r = post(doctor, f"/doctor/consultation/{cid1}", diagnosis="Rupture LCA", decision="chirurgie",
         surgery_label="Ligamentoplastie", medication="")
check(r.status_code == 302, "diagnostic + chirurgie validés")
with app.app_context():
    s = Surgery.query.filter_by(patient_id=p1.id).one()
    check(s.room is not None and s.start > s.consultation.closed_at, f"chambre {s.room.number} et créneau {s.start:%d/%m %H:%M} attribués")
r = doctor.get(r.location)
check(b"Ligamentoplastie" in r.data and b"Chambre" in r.data, "document patient (chirurgie) imprimable")

r = post(doctor, f"/doctor/consultation/{cid2}", diagnosis="Anémie", decision="medicament",
         medication="Fer 80 mg, 1 cp/jour", surgery_label="")
check(r.status_code == 302, "diagnostic + médicaments validés")
r = doctor.get(r.location)
check(b"Fer 80 mg" in r.data, "document patient (ordonnance) imprimable")

# 2e visite du même patient : même dossier, historique visible
post(reception, "/reception/register?card=1234567890",
     first_name="Ahmed", last_name="Ben Salah", address="Nouvelle adresse", phone="20123456")
with app.app_context():
    check(Patient.query.count() == 2, "patient existant mis à jour (pas de doublon)")
    cid3 = Consultation.query.order_by(Consultation.id.desc()).first().id
post(nurse, f"/nurse/consultation/{cid3}", prescription_details="Contrôle", nurse_notes="")
r = doctor.get(f"/doctor/consultation/{cid3}")
check(b"Rupture LCA" in r.data, "historique médical affiché à la 2e visite")
post(doctor, f"/doctor/consultation/{cid3}", diagnosis="Suivi OK", decision="medicament", medication="Repos")

# Localisation par la réception
r = reception.get("/reception/search?q=Ben Salah")
check(b"Chambre" in r.data and b"Ligamentoplastie" in r.data, "la réception localise le patient (chambre/créneau)")

# ---- Phase 3 : SysBill -----------------------------------------------------
r = post(admin, "/billing/run")
check(r.status_code == 302, "SysBill déclenché")
with app.app_context():
    bill = Bill.query.one()
    check(bill.total_acts == 3, f"3 actes facturés (trouvé {bill.total_acts})")
    check(float(bill.total_amount) == 350 + 35 + 35, f"montant = 420 TND (trouvé {bill.total_amount})")
    check(set(bill.cnss_numbers.split(",")) == {"1234567890", "1555555555"}, "numéros CNSS distincts collectés")
    check(bill.status == "envoyee" and bill.cnss_reference, f"facture envoyée à la CNSS ({bill.cnss_reference})")
    check(len(bill.lines) == 1 and bill.lines[0].act_count == 3, "rémunération du médecin calculée")
r = post(admin, "/billing/run")
check(r.status_code == 302, "2e exécution : rien à refacturer")
with app.app_context():
    check(Bill.query.count() == 1, "pas de double facturation")

# ---- Sécurité de base ------------------------------------------------------
check(nurse.get("/doctor/").status_code == 403, "rôles cloisonnés (infirmier -> /doctor = 403)")
check(app.test_client().get("/reception/").status_code == 302, "accès anonyme redirigé vers /login")
check(reception.post("/reception/", data={"cnss_number": "1"}).status_code == 400, "POST sans jeton CSRF refusé")
check(app.test_client().get("/api/cnss/validate/1234567").json["status"] == "valid", "API CNSS simulée OK")

print("\nTOUS LES TESTS PASSENT")
