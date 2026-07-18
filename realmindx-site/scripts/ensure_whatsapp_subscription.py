"""Idempotently subscribe the configured WABA to the configured Meta app.

Meta can verify the callback URL while the WhatsApp Business Account is not
actually subscribed to the app. In that state, inbound WhatsApp messages never
reach /api/webhooks/whatsapp. This deployment safety check avoids that silent
failure mode.

The script never prints tokens or secrets. It is non-fatal by default so a
temporary Meta outage does not block unrelated deployments. Set
WHATSAPP_SUBSCRIPTION_ENFORCE=true to make failures exit non-zero.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

SITE_ROOT = Path(__file__).resolve().parents[1]
if str(SITE_ROOT) not in sys.path:
    sys.path.insert(0, str(SITE_ROOT))

from backend import create_app


def _bool_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _safe_error(response: requests.Response) -> dict[str, object]:
    try:
        payload = response.json()
    except ValueError:
        return {"message": response.text[:180], "status": response.status_code}
    error = payload.get("error") or {}
    return {
        "message": error.get("message"),
        "type": error.get("type"),
        "code": error.get("code"),
        "subcode": error.get("error_subcode"),
        "status": response.status_code,
    }


def _entry_app_id(entry: dict[str, object]) -> str:
    nested = entry.get("whatsapp_business_api_data")
    if isinstance(nested, dict):
        return str(nested.get("id") or "")
    return str(entry.get("id") or "")


def main() -> int:
    enforce = _bool_env("WHATSAPP_SUBSCRIPTION_ENFORCE", False)
    app = create_app()
    with app.app_context():
        if not app.config.get("WHATSAPP_PHONE_VERIFICATION_ENABLED", False):
            print("WhatsApp subscription check skipped: phone verification is disabled.")
            return 0

        token = app.config.get("WHATSAPP_ACCESS_TOKEN")
        app_id = app.config.get("WHATSAPP_APP_ID")
        waba_id = app.config.get("WHATSAPP_BUSINESS_ACCOUNT_ID")
        version = app.config.get("WHATSAPP_GRAPH_API_VERSION") or "v25.0"
        missing = [
            name
            for name, value in {
                "WHATSAPP_ACCESS_TOKEN": token,
                "WHATSAPP_APP_ID": app_id,
                "WHATSAPP_BUSINESS_ACCOUNT_ID": waba_id,
            }.items()
            if not value
        ]
        if missing:
            print(f"WhatsApp subscription check skipped: missing {', '.join(missing)}.")
            return 1 if enforce else 0

        headers = {"Authorization": f"Bearer {token}"}
        subscribe_url = f"https://graph.facebook.com/{version}/{waba_id}/subscribed_apps"
        try:
            subscribe = requests.post(subscribe_url, headers=headers, timeout=20)
        except requests.RequestException as exc:
            print(f"WhatsApp subscription check warning: subscribe request failed ({type(exc).__name__}).")
            return 1 if enforce else 0
        if subscribe.status_code >= 400:
            print(f"WhatsApp subscription check warning: subscribe failed {_safe_error(subscribe)}")
            return 1 if enforce else 0

        try:
            verify = requests.get(subscribe_url, headers=headers, timeout=20)
        except requests.RequestException as exc:
            print(f"WhatsApp subscription check warning: readback failed ({type(exc).__name__}).")
            return 1 if enforce else 0
        if verify.status_code >= 400:
            print(f"WhatsApp subscription check warning: readback failed {_safe_error(verify)}")
            return 1 if enforce else 0

        apps = verify.json().get("data") or []
        subscribed = any(_entry_app_id(entry) == str(app_id) for entry in apps if isinstance(entry, dict))
        if not subscribed:
            print("WhatsApp subscription check warning: app not visible in WABA readback after subscribe.")
            return 1 if enforce else 0

        print(f"WhatsApp subscription check ok: WABA {waba_id} is subscribed to app {app_id}.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
