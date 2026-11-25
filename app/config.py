import os


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")

    # SQLite par défaut.
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL", "mysql+pymysql://root:@localhost/syschs?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # Si vide, la validation CNSS utilise la simulation interne (mock).
    # Sinon : URL de base d'un serveur CNSS (ex. http://127.0.0.1:5000).
    CNSS_API_URL = os.getenv("CNSS_API_URL", "")

    # Tarifs des actes médicaux (en TND)
    ACT_TARIFFS = {"consultation": 35.0, "chirurgie": 350.0}

    # Planification des interventions
    SURGERY_SLOT_HOURS = 2
    SURGERY_DAY_START = 8
    SURGERY_DAY_END = 18

    # Affiche les comptes de démonstration sur la page de connexion (désactiver en production)
    SHOW_DEMO_ACCOUNTS = os.getenv("SHOW_DEMO_ACCOUNTS", "1") == "1"

    # SysBill : exécution automatique chaque lundi à 02:00
    ENABLE_SCHEDULER = os.getenv("ENABLE_SCHEDULER", "1") == "1"
    SYSBILL_DAY_OF_WEEK = os.getenv("SYSBILL_DAY_OF_WEEK", "mon")
    SYSBILL_HOUR = int(os.getenv("SYSBILL_HOUR", "2"))
