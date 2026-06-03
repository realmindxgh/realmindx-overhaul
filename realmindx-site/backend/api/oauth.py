"""
OAuth social login - Google, Microsoft (Entra ID), Facebook.

Flow:
  1.  User clicks a provider button in the frontend.
  2.  Browser navigates to /api/auth/<provider>   (proxied from Vite:5173)
  3.  Flask builds the provider's authorization URL and redirects.
  4.  Provider redirects back to /api/auth/<provider>/callback.
  5.  Flask exchanges the code for a user profile.
  6.  Flask creates / finds the User + AuthIdentity row.
  7.  Flask logs the user in and redirects to the frontend portal page.

Environment variables required per provider (add to realmindx-site/.env):
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
  MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
  FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
"""

import os
from datetime import datetime, timezone

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, current_app, redirect, session, url_for
from flask_login import login_user

from ..extensions import db
from ..models import AuthIdentity, Role, User, UserProfile

oauth_bp = Blueprint("oauth", __name__)
oauth = OAuth()


def _base_url():
    """The public-facing origin - Vite in dev, real domain in prod."""
    return (os.getenv("BASE_URL") or "http://localhost:5173").rstrip("/")


def _callback_url(provider):
    return f"{_base_url()}/api/auth/{provider}/callback"


def init_oauth(app):
    """Call from create_app() after app is configured."""
    oauth.init_app(app)

    if app.config.get("GOOGLE_CLIENT_ID"):
        oauth.register(
            name="google",
            client_id=app.config["GOOGLE_CLIENT_ID"],
            client_secret=app.config["GOOGLE_CLIENT_SECRET"],
            server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

    if app.config.get("MICROSOFT_CLIENT_ID"):
        tenant = app.config.get("MICROSOFT_TENANT_ID", "common")
        oauth.register(
            name="microsoft",
            client_id=app.config["MICROSOFT_CLIENT_ID"],
            client_secret=app.config["MICROSOFT_CLIENT_SECRET"],
            server_metadata_url=f"https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration",
            client_kwargs={"scope": "openid email profile"},
        )

    if app.config.get("FACEBOOK_APP_ID"):
        oauth.register(
            name="facebook",
            client_id=app.config["FACEBOOK_APP_ID"],
            client_secret=app.config["FACEBOOK_APP_SECRET"],
            access_token_url="https://graph.facebook.com/oauth/access_token",
            access_token_params=None,
            authorize_url="https://www.facebook.com/dialog/oauth",
            authorize_params=None,
            api_base_url="https://graph.facebook.com/",
            client_kwargs={"scope": "email public_profile"},
        )


def _get_or_create_user(provider, provider_user_id, email, first_name, last_name):
    """Find existing user via AuthIdentity, or create a new one."""
    identity = AuthIdentity.query.filter_by(
        provider=provider, provider_user_id=str(provider_user_id)
    ).first()

    if identity:
        return identity.user

    # Check if email already exists (merge providers on same email)
    user = User.query.filter_by(email=email.lower()).first() if email else None

    if not user:
        role = Role.query.filter_by(name="user").first()
        if not role:
            role = Role(name="user", description="Public account")
            db.session.add(role)
        user = User(
            email=(email or f"{provider}_{provider_user_id}@noemail.local").lower(),
            first_name=first_name or "",
            last_name=last_name or "",
            role=role,
            is_verified=True,   # social login implies verified email
        )
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))

    # Create the AuthIdentity link
    db.session.add(AuthIdentity(
        user_id=user.id,
        provider=provider,
        provider_user_id=str(provider_user_id),
        email=email,
    ))
    db.session.commit()
    return user


def _login_and_redirect(user, frontend_path="/portal"):
    login_user(user, remember=True)
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()
    return redirect(f"{_base_url()}{frontend_path}")


def _provider_not_configured(provider):
    return redirect(
        f"{_base_url()}/login?error=provider_unavailable&provider={provider}"
    )


# â”€â”€ Apple (Sign in with Apple) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Requires APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
# and HTTPS redirect URI. Works on VPS; not on localhost (Apple blocks HTTP).

@oauth_bp.get("/auth/apple")
def apple_login():
    if not current_app.config.get("APPLE_CLIENT_ID"):
        return _provider_not_configured("apple")
    import secrets
    from authlib.integrations.flask_client import OAuth as _OAuth
    apple = _OAuth().create_client("apple")
    nonce = secrets.token_urlsafe(16)
    return apple.authorize_redirect(
        _callback_url("apple"),
        response_mode="form_post",
        scope="name email",
        nonce=nonce,
    )


@oauth_bp.post("/auth/apple/callback")
def apple_callback():
    if not current_app.config.get("APPLE_CLIENT_ID"):
        return redirect(f"{_base_url()}/login?error=provider_unavailable&provider=apple")
    try:
        from authlib.integrations.flask_client import OAuth as _OAuth
        apple = _OAuth().create_client("apple")
        token = apple.authorize_access_token()
        info = token.get("userinfo") or {}
        # Apple only sends the name on the FIRST login; store it on first use
        id_token = token.get("id_token_claims", {})
        user = _get_or_create_user(
            provider="apple",
            provider_user_id=id_token.get("sub", ""),
            email=id_token.get("email", ""),
            first_name=info.get("name", {}).get("firstName", "") if isinstance(info.get("name"), dict) else "",
            last_name=info.get("name", {}).get("lastName", "") if isinstance(info.get("name"), dict) else "",
        )
        return _login_and_redirect(user)
    except Exception as exc:
        current_app.logger.warning("Apple OAuth callback failed: %s", exc)
        return redirect(f"{_base_url()}/login?error=apple_failed")


# â”€â”€ Google â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@oauth_bp.get("/auth/google")
def google_login():
    if not current_app.config.get("GOOGLE_CLIENT_ID"):
        return _provider_not_configured("google")
    return oauth.google.authorize_redirect(_callback_url("google"))


@oauth_bp.get("/auth/google/callback")
def google_callback():
    token = oauth.google.authorize_access_token()
    info = token.get("userinfo") or oauth.google.userinfo()
    user = _get_or_create_user(
        provider="google",
        provider_user_id=info["sub"],
        email=info.get("email", ""),
        first_name=info.get("given_name", ""),
        last_name=info.get("family_name", ""),
    )
    return _login_and_redirect(user)


# â”€â”€ Microsoft â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@oauth_bp.get("/auth/microsoft")
def microsoft_login():
    if not current_app.config.get("MICROSOFT_CLIENT_ID"):
        return _provider_not_configured("microsoft")
    return oauth.microsoft.authorize_redirect(_callback_url("microsoft"))


@oauth_bp.get("/auth/microsoft/callback")
def microsoft_callback():
    token = oauth.microsoft.authorize_access_token()
    info = token.get("userinfo") or {}
    user = _get_or_create_user(
        provider="microsoft",
        provider_user_id=info.get("sub") or info.get("oid", ""),
        email=info.get("email") or info.get("preferred_username", ""),
        first_name=info.get("given_name", ""),
        last_name=info.get("family_name", ""),
    )
    return _login_and_redirect(user)


# â”€â”€ Facebook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@oauth_bp.get("/auth/facebook")
def facebook_login():
    if not current_app.config.get("FACEBOOK_APP_ID"):
        return _provider_not_configured("facebook")
    return oauth.facebook.authorize_redirect(_callback_url("facebook"))


@oauth_bp.get("/auth/facebook/callback")
def facebook_callback():
    oauth.facebook.authorize_access_token()
    resp = oauth.facebook.get("me?fields=id,name,email,first_name,last_name")
    info = resp.json()
    user = _get_or_create_user(
        provider="facebook",
        provider_user_id=info["id"],
        email=info.get("email", ""),
        first_name=info.get("first_name", ""),
        last_name=info.get("last_name", ""),
    )
    return _login_and_redirect(user)
