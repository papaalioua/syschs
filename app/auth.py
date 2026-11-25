import secrets
from functools import wraps

from flask import Blueprint, abort, flash, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash

from .models import User, db

bp = Blueprint("auth", __name__)

ROLE_HOME = {
    "reception": "reception.index",
    "nurse": "nurse.index",
    "doctor": "doctor.index",
    "admin": "billing.index",
}


def current_user():
    uid = session.get("user_id")
    return db.session.get(User, uid) if uid else None


def role_required(*roles):
    def decorator(view):
        @wraps(view)
        def wrapper(*args, **kwargs):
            user = current_user()
            if user is None:
                return redirect(url_for("auth.login", next=request.path))
            if user.role not in roles:
                abort(403)
            return view(*args, **kwargs)
        return wrapper
    return decorator


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_hex(16)
    return session["csrf"]


@bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        user = User.query.filter_by(username=request.form.get("username", "").strip()).first()
        if user and check_password_hash(user.password_hash, request.form.get("password", "")):
            session.clear()
            session["user_id"] = user.id
            nxt = request.args.get("next", "")
            if nxt.startswith("/") and not nxt.startswith("//"):
                return redirect(nxt)
            return redirect(url_for(ROLE_HOME[user.role]))
        flash("Identifiant ou mot de passe incorrect.", "error")
    return render_template("login.html")


@bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
