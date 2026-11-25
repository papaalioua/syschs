from datetime import datetime, timedelta

from flask import Blueprint, abort, current_app, flash, redirect, render_template, url_for

from .. import services
from ..auth import role_required
from ..models import ST_DONE, Bill, Consultation, db

bp = Blueprint("billing", __name__, url_prefix="/billing")


@bp.route("/")
@role_required("admin")
def index():
    bills = Bill.query.order_by(Bill.created_at.desc()).all()
    pending_acts = Consultation.query.filter(
        Consultation.status == ST_DONE, Consultation.bill_id.is_(None)
    ).all()
    tariffs = current_app.config["ACT_TARIFFS"]
    kpi = {
        "pending_amount": sum(tariffs[c.act_type] for c in pending_acts),
        "billed": sum(float(b.total_amount) for b in bills if b.status == "envoyee"),
        "failed": sum(1 for b in bills if b.status != "envoyee"),
        "next_run": next_run(),
    }
    return render_template("billing/index.html", bills=bills, pending=len(pending_acts),
                           kpi=kpi, tariffs=tariffs)


DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def next_run(now=None):
    """Date de la prochaine exécution automatique de SysBill."""
    now = now or datetime.now()
    cfg = current_app.config
    day = str(cfg["SYSBILL_DAY_OF_WEEK"])[:3].lower()
    if day not in DAYS:  # expression cron complexe : pas d'affichage
        return None
    target = DAYS.index(day)
    run = now.replace(hour=cfg["SYSBILL_HOUR"], minute=0, second=0, microsecond=0)
    run += timedelta(days=(target - now.weekday()) % 7)
    return run if run > now else run + timedelta(days=7)


@bp.route("/run", methods=["POST"])
@role_required("admin")
def run():
    """Déclenchement manuel de SysBill (utile pour la démonstration)."""
    bill = services.run_sysbill()
    if bill is None:
        flash("Aucun acte à facturer.", "error")
        return redirect(url_for("billing.index"))
    flash(f"Facture n°{bill.id} générée ({bill.total_acts} actes).", "ok")
    return redirect(url_for("billing.detail", bill_id=bill.id))


@bp.route("/<int:bill_id>")
@role_required("admin")
def detail(bill_id):
    bill = db.session.get(Bill, bill_id) or abort(404)
    return render_template("billing/detail.html", bill=bill)


@bp.route("/<int:bill_id>/retry", methods=["POST"])
@role_required("admin")
def retry(bill_id):
    bill = db.session.get(Bill, bill_id) or abort(404)
    if bill.status != "envoyee":
        services.send_bill(bill)
    return redirect(url_for("billing.detail", bill_id=bill.id))
