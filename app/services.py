"""Logique métier de SysCHS (inscription, ordonnance, diagnostic, chirurgie, SysBill)."""
import re
from datetime import datetime, timedelta
from decimal import Decimal
from io import BytesIO

import barcode
from barcode.writer import SVGWriter
from flask import current_app

from . import cnss_client
from .models import (
    ST_DONE, ST_READY, ST_REGISTERED, Bill, BillLine, Consultation, Dossier, Patient,
    Room, Surgery, db,
)


# ---------------------------------------------------------------- Codes-barres
def barcode_svg(value: str) -> str:
    """Retourne un code-barres Code128 sous forme de SVG inline."""
    buf = BytesIO()
    barcode.get("code128", value, writer=SVGWriter()).write(
        buf, options={"module_height": 10, "font_size": 4, "text_distance": 2, "quiet_zone": 2}
    )
    svg = buf.getvalue().decode()
    svg = svg[svg.index("<svg"):]
    # Rend le SVG redimensionnable (les cotes internes sont en mm : 1 mm = 3.7795 px).
    m = re.match(r'<svg([^>]*?) width="([\d.]+)mm" height="([\d.]+)mm"', svg)
    if m:
        w, h = float(m.group(2)) * 3.7795, float(m.group(3)) * 3.7795
        svg = svg.replace(m.group(0), f'<svg{m.group(1)} viewBox="0 0 {w:.1f} {h:.1f}" '
                                      f'width="{w:.0f}" height="{h:.0f}" role="img"', 1)
    return svg


# ---------------------------------------------------------------- Phase 1 : inscription
def register_visit(user, card_number, first_name, last_name, address, phone):
    """Crée ou met à jour le patient, crée son dossier si besoin et ouvre une consultation."""
    patient = Patient.query.filter_by(cnss_number=card_number).first()
    if patient is None:
        patient = Patient(cnss_number=card_number)
        db.session.add(patient)
    patient.first_name = first_name
    patient.last_name = last_name
    patient.address = address
    patient.phone = phone
    db.session.flush()

    dossier = patient.dossier
    if dossier is None:
        dossier = Dossier(patient_id=patient.id, barcode=f"SCH{patient.id:08d}")
        db.session.add(dossier)
        db.session.flush()

    consultation = Consultation(
        patient_id=patient.id,
        dossier_id=dossier.id,
        registered_by_id=user.id,
        status=ST_REGISTERED,
    )
    db.session.add(consultation)
    db.session.commit()
    return consultation


# ---------------------------------------------------------------- Phase 2 : infirmier
def find_open_consultation_by_barcode(code, status):
    dossier = Dossier.query.filter_by(barcode=code.strip()).first()
    if dossier is None:
        # La 2e étiquette (au dos de la carte CNSS) encode le numéro CNSS.
        patient = Patient.query.filter_by(cnss_number=code.strip()).first()
        dossier = patient.dossier if patient else None
    if dossier is None:
        return None
    return (
        Consultation.query.filter_by(dossier_id=dossier.id, status=status)
        .order_by(Consultation.created_at.desc())
        .first()
    )


def save_nurse_entry(consultation, nurse, prescription_details, nurse_notes):
    if consultation.status != ST_REGISTERED:
        raise ValueError("Cette consultation a déjà été traitée par l'infirmier.")
    if not prescription_details.strip():
        raise ValueError("Les détails de l'ordonnance sont obligatoires.")
    consultation.prescription_details = prescription_details.strip()
    consultation.nurse_notes = (nurse_notes or "").strip() or None
    consultation.nurse_id = nurse.id
    consultation.nurse_at = datetime.now()
    consultation.status = ST_READY
    db.session.commit()


# ---------------------------------------------------------------- Phase 2 : médecin
def book_surgery(consultation, label, now=None):
    """Affecte automatiquement la première chambre libre au premier créneau disponible."""
    cfg = current_app.config
    now = now or datetime.now()
    rooms = Room.query.order_by(Room.number).all()
    if not rooms:
        raise ValueError("Aucune chambre n'est configurée.")
    slot = timedelta(hours=cfg["SURGERY_SLOT_HOURS"])

    first_day = (now + timedelta(days=1)).replace(
        hour=cfg["SURGERY_DAY_START"], minute=0, second=0, microsecond=0
    )
    for offset in range(60):
        day_start = first_day + timedelta(days=offset)
        day_end = day_start.replace(hour=cfg["SURGERY_DAY_END"])
        start = day_start
        while start + slot <= day_end:
            end = start + slot
            for room in rooms:
                clash = Surgery.query.filter(
                    Surgery.room_id == room.id, Surgery.start < end, Surgery.end > start
                ).first()
                if clash is None:
                    surgery = Surgery(
                        consultation_id=consultation.id, patient_id=consultation.patient_id,
                        room_id=room.id, label=label, start=start, end=end,
                    )
                    db.session.add(surgery)
                    return surgery
            start = end
    raise ValueError("Aucun créneau opératoire disponible dans les 60 prochains jours.")


def close_consultation(consultation, doctor, diagnosis, decision, medication, surgery_label):
    if consultation.status != ST_READY:
        raise ValueError("La consultation n'est pas prête pour le médecin.")
    if not diagnosis.strip():
        raise ValueError("Le diagnostic est obligatoire.")
    if decision not in ("chirurgie", "medicament"):
        raise ValueError("Choisissez une décision : chirurgie ou médicaments.")
    if decision == "medicament" and not medication.strip():
        raise ValueError("Saisissez la nouvelle ordonnance.")

    consultation.diagnosis = diagnosis.strip()
    consultation.decision = decision
    consultation.doctor_id = doctor.id
    consultation.closed_at = datetime.now()
    consultation.status = ST_DONE

    if decision == "chirurgie":
        consultation.act_type = "chirurgie"
        book_surgery(consultation, surgery_label.strip() or "Intervention chirurgicale")
    else:
        consultation.act_type = "consultation"
        consultation.medication = medication.strip()
    db.session.commit()
    return consultation.surgery


# ---------------------------------------------------------------- Phase 3 : SysBill
def bill_payload(bill):
    return {
        "bill_id": bill.id,
        "period_start": bill.period_start.isoformat(),
        "period_end": bill.period_end.isoformat(),
        "cnss_numbers": [n for n in bill.cnss_numbers.split(",") if n],
        "total_acts": bill.total_acts,
        "total_amount": float(bill.total_amount),
    }


def send_bill(bill):
    resp = cnss_client.send_bill(bill_payload(bill))
    if resp.get("status") == "accepted":
        bill.status = "envoyee"
        bill.cnss_reference = resp.get("reference")
    else:
        bill.status = "echec"
    db.session.commit()
    return bill


def run_sysbill(now=None):
    """Facture tous les actes terminés non encore facturés (exécuté chaque semaine)."""
    now = now or datetime.now()
    tariffs = current_app.config["ACT_TARIFFS"]
    pending = Consultation.query.filter(
        Consultation.status == ST_DONE,
        Consultation.bill_id.is_(None),
        Consultation.closed_at <= now,
    ).all()
    if not pending:
        return None

    bill = Bill(
        period_start=min(c.closed_at for c in pending),
        period_end=now,
        cnss_numbers=",".join(sorted({c.patient.cnss_number for c in pending})),
        total_acts=len(pending),
        total_amount=Decimal("0"),
    )
    db.session.add(bill)
    db.session.flush()

    per_doctor = {}
    for c in pending:
        amount = Decimal(str(tariffs[c.act_type]))
        entry = per_doctor.setdefault(c.doctor_id, [0, Decimal("0")])
        entry[0] += 1
        entry[1] += amount
        c.bill_id = bill.id
    for doctor_id, (count, amount) in per_doctor.items():
        db.session.add(BillLine(bill_id=bill.id, doctor_id=doctor_id, act_count=count, amount=amount))
    bill.total_amount = sum((a for _, a in per_doctor.values()), Decimal("0"))
    db.session.commit()

    return send_bill(bill)
