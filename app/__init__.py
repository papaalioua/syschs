import os
from datetime import datetime

from flask import Flask, abort, redirect, request, session, url_for

from .config import Config
from .models import ST_DONE, ST_READY, ST_REGISTERED, Consultation, db

STATUS_LABELS = {
    ST_REGISTERED: ("En attente infirmier", "wait"),
    ST_READY: ("Prêt pour le médecin", "ready"),
    ST_DONE: ("Terminé", "done"),
}
ROLE_LABELS = {
    "reception": "Réception",
    "nurse": "Infirmerie",
    "doctor": "Médecin",
    "admin": "Facturation",
}


def create_app(overrides=None):
    app = Flask(__name__)
    app.config.from_object(Config)
    if overrides:
        app.config.update(overrides)
    db.init_app(app)

    from . import auth
    from .routes import billing, cnss, doctor, nurse, reception

    for module in (auth, reception, nurse, doctor, billing, cnss):
        app.register_blueprint(module.bp)

    @app.route("/")
    def home():
        user = auth.current_user()
        if user is None:
            return redirect(url_for("auth.login"))
        return redirect(url_for(auth.ROLE_HOME[user.role]))

    @app.before_request
    def check_csrf():
        # L'API CNSS simulée est un système externe : pas de jeton CSRF.
        if request.method == "POST" and not request.path.startswith("/api/"):
            token = session.get("csrf")
            if not token or token != request.form.get("csrf_token"):
                abort(400, "Jeton CSRF invalide")

    @app.context_processor
    def inject_globals():
        user = auth.current_user()
        flow = None
        if user is not None:
            # Circuit patient : nombre de dossiers à chaque étape (barre latérale + bandeau).
            flow = {
                "registered": Consultation.query.filter_by(status=ST_REGISTERED).count(),
                "ready": Consultation.query.filter_by(status=ST_READY).count(),
                "unbilled": Consultation.query.filter(
                    Consultation.status == ST_DONE, Consultation.bill_id.is_(None)).count(),
            }
        return {
            "current_user": user,
            "csrf_token": auth.csrf_token,
            "flow": flow,
            "role_labels": ROLE_LABELS,
            "now": datetime.now(),
        }

    @app.template_filter("dt")
    def fmt_dt(value):
        return value.strftime("%d/%m/%Y %H:%M") if value else "—"

    @app.template_filter("status_label")
    def status_label(value):
        return STATUS_LABELS.get(value, (value, ""))[0]

    @app.template_filter("status_class")
    def status_class(value):
        return STATUS_LABELS.get(value, (value, ""))[1]

    @app.template_filter("initials")
    def initials(name):
        parts = [p for p in (name or "").replace("Dr.", "").split() if p]
        return "".join(p[0] for p in parts[:2]).upper() or "?"

    @app.template_filter("money")
    def money(value):
        return f"{float(value or 0):,.3f}".replace(",", " ")

    @app.template_filter("ago")
    def ago(value):
        if not value:
            return "—"
        minutes = int((datetime.now() - value).total_seconds() // 60)
        if minutes < 1:
            return "à l'instant"
        if minutes < 60:
            return f"il y a {minutes} min"
        if minutes < 24 * 60:
            return f"il y a {minutes // 60} h {minutes % 60:02d}"
        return value.strftime("%d/%m/%Y")

    if app.config["ENABLE_SCHEDULER"] and (
        not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true"
    ):
        _start_scheduler(app)

    return app


def _start_scheduler(app):
    """SysBill : lancé automatiquement une fois par semaine."""
    from apscheduler.schedulers.background import BackgroundScheduler

    from .services import run_sysbill

    def job():
        with app.app_context():
            run_sysbill()

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        job, "cron",
        day_of_week=app.config["SYSBILL_DAY_OF_WEEK"], hour=app.config["SYSBILL_HOUR"],
        id="sysbill",
    )
    scheduler.start()
