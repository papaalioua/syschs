from datetime import datetime

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for

from .. import services
from ..auth import current_user, role_required
from ..models import ST_REGISTERED, Consultation, db

bp = Blueprint("nurse", __name__, url_prefix="/nurse")


@bp.route("/", methods=["GET", "POST"])
@role_required("nurse")
def index():
    if request.method == "POST":
        code = request.form.get("barcode", "").strip()
        consultation = services.find_open_consultation_by_barcode(code, ST_REGISTERED)
        if consultation is None:
            flash("Aucun dossier en attente pour ce code-barres.", "error")
        else:
            return redirect(url_for("nurse.consultation", consultation_id=consultation.id))
    waiting = (Consultation.query.filter_by(status=ST_REGISTERED)
               .order_by(Consultation.created_at).all())
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    done_today = Consultation.query.filter(
        Consultation.nurse_id == current_user().id, Consultation.nurse_at >= today).count()
    return render_template("nurse/index.html", waiting=waiting, done_today=done_today)


@bp.route("/consultation/<int:consultation_id>", methods=["GET", "POST"])
@role_required("nurse")
def consultation(consultation_id):
    c = db.session.get(Consultation, consultation_id) or abort(404)
    if request.method == "POST":
        try:
            services.save_nurse_entry(
                c, current_user(),
                request.form.get("prescription_details", ""), request.form.get("nurse_notes", ""),
            )
        except ValueError as e:
            flash(str(e), "error")
        else:
            flash("Ordonnance enregistrée. Informez le patient que le médecin va le recevoir.", "ok")
            return redirect(url_for("nurse.index"))
    return render_template("nurse/consultation.html", c=c)
