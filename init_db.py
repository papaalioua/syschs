"""Crée les tables et les données de démonstration (comptes + chambres).

Usage : python init_db.py           # comptes + 10 chambres
        python init_db.py --demo    # + quelques patients à toutes les étapes du circuit
"""
import sys
from datetime import datetime, timedelta

from werkzeug.security import generate_password_hash

from app import create_app
from app.models import Patient, Room, User, db

DEMO_PASSWORD = "demo1234"

USERS = [
    ("reception1", "Salma Reception", "reception"),
    ("nurse1", "Nour Infirmière", "nurse"),
    ("doctor1", "Dr. Amine Gharbi", "doctor"),
    ("doctor2", "Dr. Ines Trabelsi", "doctor"),
    ("admin", "Administrateur", "admin"),
]

# (carte, prénom, nom, adresse, téléphone, étape, détails)
DEMO_PATIENTS = [
    ("1234567890", "Ahmed", "Ben Salah", "12 rue de la République, Nabeul", "20123456", "chirurgie",
     ("Radio du genou droit", "TA 12/8 · douleur 7/10", "Rupture du ligament croisé antérieur", "Ligamentoplastie du genou")),
    ("1555555555", "Salma", "Gharbi", "4 avenue Habib Bourguiba, Sousse", "55111222", "medicament",
     ("Bilan sanguin complet", "Fatigue, pâleur", "Anémie ferriprive", "Fer 80 mg : 1 cp/jour pendant 3 mois")),
    ("1987654321", "Mariem", "Trabelsi", "8 rue Ibn Khaldoun, Monastir", "98765432", "medicament",
     ("Échographie abdominale", "T° 37,8", "Lithiase biliaire non compliquée", "Antispasmodique si douleur, régime pauvre en graisses")),
    ("1122334455", "Youssef", "Jlassi", "21 rue de Marseille, Tunis", "22334455", "pret",
     ("ECG + bilan lipidique", "TA 15/9 · fréquence 88", None, None)),
    ("1777777777", "Fatma", "Hammami", "3 rue des Oliviers, Hammamet", "50777777", "pret",
     ("Radio thorax", "Toux depuis 10 jours", None, None)),
    ("1444444444", "Sami", "Mansouri", "17 rue de Kairouan, Sfax", "20444444", "enregistre", None),
    ("1666666666", "Ines", "Khelifi", "9 cité El Riadh, Sousse", "55666666", "enregistre", None),
]


def seed():
    db.create_all()
    for username, full_name, role in USERS:
        if not User.query.filter_by(username=username).first():
            db.session.add(User(username=username, full_name=full_name, role=role,
                                password_hash=generate_password_hash(DEMO_PASSWORD)))
    for n in range(101, 111):
        if not Room.query.filter_by(number=str(n)).first():
            db.session.add(Room(number=str(n)))
    db.session.commit()


def seed_demo():
    """Peuple la base avec des patients répartis sur tout le circuit (démonstration)."""
    from app import services

    if Patient.query.count():
        print("Des patients existent déjà : données de démonstration ignorées.")
        return
    users = {u.username: u for u in User.query.all()}
    now = datetime.now()
    for i, (card, first, last, address, phone, stage, details) in enumerate(DEMO_PATIENTS):
        c = services.register_visit(users["reception1"], card, first, last, address, phone)
        c.created_at = now - timedelta(minutes=95 - i * 12)
        if stage != "enregistre":
            prescription, notes, diagnosis, extra = details
            services.save_nurse_entry(c, users["nurse1"], prescription, notes)
            c.nurse_at = c.created_at + timedelta(minutes=9)
        if stage in ("chirurgie", "medicament"):
            doctor = users["doctor1"] if i % 2 == 0 else users["doctor2"]
            services.close_consultation(
                c, doctor, diagnosis, stage,
                medication=extra if stage == "medicament" else "",
                surgery_label=extra if stage == "chirurgie" else "",
            )
            c.closed_at = c.nurse_at + timedelta(minutes=14)
        db.session.commit()
        if i == 1:  # une première facture SysBill pour l'historique
            services.run_sysbill()
    print(f"{len(DEMO_PATIENTS)} patients de démonstration créés.")


if __name__ == "__main__":
    app = create_app({"ENABLE_SCHEDULER": False})
    with app.app_context():
        seed()
        if "--demo" in sys.argv:
            seed_demo()
    print(f"Base initialisée. Comptes de démo : mot de passe « {DEMO_PASSWORD} ».")
