from datetime import datetime

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for
from sqlalchemy import or_

from .. import cnss_client, services
from ..auth import current_user, role_required
from ..models import Consultation, Dossier, Patient, Room, Surgery, db

bp = Blueprint("reception", __name__, url_prefix="/reception")


@bp.route("/", methods=["GET", "POST"])
@role_required("reception")
def index():
    """Étape 1 : scan de la carte CNSS et validation."""
    if request.method == "POST":
        card = request.form.get("cnss_number", "").strip()
        result = cnss_client.validate(card)
        if result.get("status") != "valid":
            return render_template("reception/rejected.html", card=card, result=result)
        return redirect(url_for("reception.register", card=card))
    now = datetime.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    recent = Consultation.query.order_by(Consultation.created_at.desc()).limit(10).all()
    upcoming = (Surgery.query.filter(Surgery.end > now).order_by(Surgery.start).limit(5).all())
    busy = Surgery.query.filter(Surgery.start <= now, Surgery.end > now).count()
    kpi = {
        "today": Consultation.query.filter(Consultation.created_at >= today).count(),
        "patients": Patient.query.count(),
        "surgeries": Surgery.query.filter(Surgery.end > now).count(),
        "rooms_free": Room.query.count() - busy,
        "rooms": Room.query.count(),
    }
    return render_template("reception/index.html", recent=recent, upcoming=upcoming, kpi=kpi)


@bp.route("/register", methods=["GET", "POST"])
@role_required("reception")
def register():
    """Étape 2 : mise à jour du profil existant ou création d'un nouveau patient."""
    card = request.values.get("card", "").strip()
    result = cnss_client.validate(card)  # on ne fait pas confiance au paramètre d'URL
    if result.get("status") != "valid":
        return render_template("reception/rejected.html", card=card, result=result)

    patient = Patient.query.filter_by(cnss_number=card).first()

    if request.method == "POST":
        form = {k: request.form.get(k, "").strip() for k in ("first_name", "last_name", "address", "phone")}
        if not form["first_name"] or not form["last_name"]:
            flash("Le nom et le prénom sont obligatoires.", "error")
            return render_template("reception/register.html", card=card, patient=patient, data=form)
        consultation = services.register_visit(current_user(), card, **form)
        return redirect(url_for("reception.labels", consultation_id=consultation.id))

    if patient:  # profil existant à mettre à jour
        data = {"first_name": patient.first_name, "last_name": patient.last_name,
                "address": patient.address, "phone": patient.phone}
    else:        # nouveau patient : pré-remplissage avec les données CNSS
        data = result["patient_data"]
    return render_template("reception/register.html", card=card, patient=patient, data=data)


@bp.route("/labels/<int:consultation_id>")
@role_required("reception")
def labels(consultation_id):
    """Étape 3 : impression des deux étiquettes code-barres."""
    consultation = db.session.get(Consultation, consultation_id) or abort(404)
    patient = consultation.patient
    return render_template(
        "reception/labels.html", consultation=consultation, patient=patient,
        folder_svg=services.barcode_svg(consultation.dossier.barcode),
        card_svg=services.barcode_svg(patient.cnss_number),
    )


@bp.route("/search")
@role_required("reception")
def search():
    """Localiser un patient (chambre et créneau de son intervention)."""
    q = request.args.get("q", "").strip()
    results = []
    if q:
        like = f"%{q}%"
        patients = (
            Patient.query.outerjoin(Dossier)
            .filter(or_(Patient.last_name.ilike(like), Patient.first_name.ilike(like),
                        Patient.cnss_number == q, Dossier.barcode == q))
            .limit(20).all()
        )
        for p in patients:
            surgery = (Surgery.query.filter_by(patient_id=p.id)
                       .order_by(Surgery.start.desc()).first())
            results.append((p, surgery))
    return render_template("reception/search.html", q=q, results=results)
