from datetime import datetime

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

ROLES = ("reception", "nurse", "doctor", "admin")

# Statuts d'une consultation (visite)
ST_REGISTERED = "enregistre"   # inscrite à la réception
ST_READY = "pret"              # ordonnance saisie par l'infirmier
ST_DONE = "termine"            # diagnostic validé par le médecin


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(20), nullable=False)


class Patient(db.Model):
    __tablename__ = "patients"
    id = db.Column(db.Integer, primary_key=True)
    cnss_number = db.Column(db.String(20), unique=True, nullable=False)
    first_name = db.Column(db.String(60), nullable=False)
    last_name = db.Column(db.String(60), nullable=False)
    address = db.Column(db.String(200), nullable=False, default="")
    phone = db.Column(db.String(30), nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)

    dossier = db.relationship("Dossier", back_populates="patient", uselist=False)
    consultations = db.relationship(
        "Consultation", back_populates="patient", order_by="Consultation.created_at.desc()"
    )

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"


class Dossier(db.Model):
    """Dossier médical physique + numérique, identifié par un code-barres."""
    __tablename__ = "dossiers"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), unique=True, nullable=False)
    barcode = db.Column(db.String(30), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)

    patient = db.relationship("Patient", back_populates="dossier")


class Room(db.Model):
    __tablename__ = "rooms"
    id = db.Column(db.Integer, primary_key=True)
    number = db.Column(db.String(10), unique=True, nullable=False)

    def status_at(self, when=None):
        when = when or datetime.now()
        busy = Surgery.query.filter(
            Surgery.room_id == self.id, Surgery.start <= when, Surgery.end > when
        ).first()
        return "occupée" if busy else "libre"


class Consultation(db.Model):
    __tablename__ = "consultations"
    id = db.Column(db.Integer, primary_key=True)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    dossier_id = db.Column(db.Integer, db.ForeignKey("dossiers.id"), nullable=False)
    registered_by_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    nurse_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    doctor_id = db.Column(db.Integer, db.ForeignKey("users.id"))
    bill_id = db.Column(db.Integer, db.ForeignKey("bills.id"))

    status = db.Column(db.String(20), nullable=False, default=ST_REGISTERED)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)

    # Saisie infirmier
    prescription_details = db.Column(db.Text)
    nurse_notes = db.Column(db.Text)
    nurse_at = db.Column(db.DateTime)

    # Saisie médecin
    diagnosis = db.Column(db.Text)
    decision = db.Column(db.String(20))        # "chirurgie" | "medicament"
    medication = db.Column(db.Text)
    act_type = db.Column(db.String(20))        # "consultation" | "chirurgie" (facturation)
    closed_at = db.Column(db.DateTime)

    patient = db.relationship("Patient", back_populates="consultations")
    dossier = db.relationship("Dossier")
    registered_by = db.relationship("User", foreign_keys=[registered_by_id])
    nurse = db.relationship("User", foreign_keys=[nurse_id])
    doctor = db.relationship("User", foreign_keys=[doctor_id])
    surgery = db.relationship("Surgery", back_populates="consultation", uselist=False)


class Surgery(db.Model):
    __tablename__ = "surgeries"
    id = db.Column(db.Integer, primary_key=True)
    consultation_id = db.Column(db.Integer, db.ForeignKey("consultations.id"), nullable=False)
    patient_id = db.Column(db.Integer, db.ForeignKey("patients.id"), nullable=False)
    room_id = db.Column(db.Integer, db.ForeignKey("rooms.id"), nullable=False)
    label = db.Column(db.String(150), nullable=False)
    start = db.Column(db.DateTime, nullable=False)
    end = db.Column(db.DateTime, nullable=False)

    consultation = db.relationship("Consultation", back_populates="surgery")
    patient = db.relationship("Patient")
    room = db.relationship("Room")


class Bill(db.Model):
    """Facture hebdomadaire envoyée à la CNSS par SysBill."""
    __tablename__ = "bills"
    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.now, nullable=False)
    period_start = db.Column(db.DateTime, nullable=False)
    period_end = db.Column(db.DateTime, nullable=False)
    total_acts = db.Column(db.Integer, nullable=False, default=0)
    total_amount = db.Column(db.Numeric(10, 3), nullable=False, default=0)
    cnss_numbers = db.Column(db.Text, nullable=False, default="")   # séparés par des virgules
    status = db.Column(db.String(20), nullable=False, default="creee")  # creee|envoyee|echec
    cnss_reference = db.Column(db.String(50))

    lines = db.relationship("BillLine", back_populates="bill", cascade="all, delete-orphan")
    consultations = db.relationship("Consultation", backref="bill")


class BillLine(db.Model):
    """Rémunération d'un médecin pour la période facturée."""
    __tablename__ = "bill_lines"
    id = db.Column(db.Integer, primary_key=True)
    bill_id = db.Column(db.Integer, db.ForeignKey("bills.id"), nullable=False)
    doctor_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    act_count = db.Column(db.Integer, nullable=False)
    amount = db.Column(db.Numeric(10, 3), nullable=False)

    bill = db.relationship("Bill", back_populates="lines")
    doctor = db.relationship("User")
