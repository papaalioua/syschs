"""API CNSS simulée (système externe)."""
from flask import Blueprint, jsonify, request

from .. import cnss_client

bp = Blueprint("cnss_api", __name__, url_prefix="/api/cnss")


@bp.route("/validate/<card_number>")
def validate(card_number):
    return jsonify(cnss_client.mock_validate(card_number))


@bp.route("/bills", methods=["POST"])
def receive_bill():
    payload = request.get_json(silent=True)
    if not payload or "cnss_numbers" not in payload:
        return jsonify({"status": "rejected", "error": "Facture invalide"}), 400
    return jsonify(cnss_client.mock_receive_bill(payload))
