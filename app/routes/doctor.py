from datetime import datetime

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for

from .. import services
from ..auth import current_user, role_required
from ..models import ST_DONE, ST_READY, Consultation, Surgery, db

bp = Blueprint("doctor", __name__, url_prefix="/doctor")


@bp.route("/")
@role_required("doctor")
def index():
    waiting = Consultation.query.filter_by(status=ST_READY).order_by(Consultation.nurse_at).all()
    done = (Consultation.query.filter_by(status=ST_DONE, doctor_id=current_user().id)
            .order_by(Consultation.closed_at.desc()).limit(10).all())
    me = current_user()
    today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    kpi = {
        "today": Consultation.query.filter(
            Consultation.doctor_id == me.id, Consultation.closed_at >= today).count(),
        "surgeries": Surgery.query.join(Consultation).filter(
            Consultation.doctor_id == me.id, Surgery.end > datetime.now()).count(),
    }
    return render_template("doctor/index.html", waiting=waiting, done=done, kpi=kpi)


@bp.route("/consultation/<int:consultation_id>", methods=["GET", "POST"])
@role_required("doctor")
def consultation(consultation_id):
    c = db.session.get(Consultation, consultation_id) or abort(404)
    if c.status == ST_DONE:
        return redirect(url_for("doctor.summary", consultation_id=c.id))
    history = [h for h in c.patient.consultations if h.id != c.id and h.status == ST_DONE]

    if request.method == "POST":
        try:
            services.close_consultation(
                c, current_user(),
                diagnosis=request.form.get("diagnosis", ""),
                decision=request.form.get("decision", ""),
                medication=request.form.get("medication", ""),
                surgery_label=request.form.get("surgery_label", ""),
            )
        except ValueError as e:
            db.session.rollback()
            flash(str(e), "error")
        else:
            return redirect(url_for("doctor.summary", consultation_id=c.id))
    return render_template("doctor/consultation.html", c=c, history=history)


@bp.route("/summary/<int:consultation_id>")
@role_required("doctor")
def summary(consultation_id):
    """Document de fin de visite remis au patient (à imprimer)."""
    c = db.session.get(Consultation, consultation_id) or abort(404)
    if c.status != ST_DONE:
        abort(404)
    return render_template("doctor/summary.html", c=c)
