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

import secrets
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, current_app, redirect, request, session, url_for
from flask_login import login_user

from ..extensions import db
from ..models import AuthIdentity, Role, User, UserProfile

oauth_bp = Blueprint("oauth", __name__)
oauth = OAuth()

SAFE_NEXT_PREFIXES = (
    "/portal",
    "/bookshop",
    "/account",
    "/orders",
    "/cart",
    "/checkout",
    "/login",
    "/register",
    "/signup",
)


def _base_url():
    """The public-facing origin - Vite in dev, real domain in prod."""
    return current_app.config.get("BASE_URL", "http://localhost:5173").rstrip("/")


def _frontend_base(surface=None):
    if surface == "bookshop":
        return current_app.config.get("BOOKSHOP_URL", f"{_base_url()}/bookshop").rstrip("/")
    return current_app.config.get("BASE_URL", _base_url()).rstrip("/")


def _callback_url(provider):
    return f"{_base_url()}/api/auth/{provider}/callback"


def _primary_auth_handoff():
    """Run provider authorization on the main origin where callbacks are registered."""
    if request.args.get("surface") != "bookshop" or request.args.get("_primary_oauth") == "1":
        return None
    primary_host = urlsplit(_base_url()).hostname
    bookshop_host = urlsplit(_frontend_base("bookshop")).hostname
    if not primary_host or not bookshop_host or primary_host == bookshop_host:
        return None
    query = request.query_string.decode("utf-8", errors="ignore")
    query = f"{query}&_primary_oauth=1" if query else "_primary_oauth=1"
    target = f"{_base_url()}{request.path}"
    return redirect(f"{target}?{query}")


def _safe_next(default="/portal"):
    raw = request.args.get("next") or session.pop("oauth_next", None) or default
    if not isinstance(raw, str):
        return default
    raw = raw.strip() or default
    if not raw.startswith("/") or raw.startswith("//"):
        return default
    if raw == "/" or raw.startswith(SAFE_NEXT_PREFIXES):
        return raw
    return default


def _remember_next(default="/portal"):
    next_path = _safe_next(default)
    session["oauth_next"] = next_path
    surface = str(request.args.get("surface") or "").strip().lower()
    session["oauth_surface"] = "bookshop" if surface == "bookshop" else "main"
    session["oauth_intent"] = str(request.args.get("intent") or "login").strip().lower()
    session["oauth_terms_accepted"] = request.args.get("accepted_terms") == "1"
    return next_path


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
        return identity.user, False

    # Check if email already exists (merge providers on same email)
    user = User.query.filter_by(email=email.lower()).first() if email else None

    created = False
    if not user:
        role = Role.query.filter_by(name="user").first()
        if not role:
            role = Role(name="user", description="Public account")
            db.session.add(role)
        from ..profile_completion import CURRENT_TERMS_VERSION
        from ..models import TermsAcceptance
        terms_now = datetime.now(timezone.utc) if session.get("oauth_terms_accepted") else None
        user = User(
            email=(email or f"{provider}_{provider_user_id}@noemail.local").lower(),
            first_name=first_name or "",
            last_name=last_name or "",
            role=role,
            is_verified=True,
            terms_accepted_at=terms_now,
            terms_version=CURRENT_TERMS_VERSION if terms_now else None,
            privacy_version=CURRENT_TERMS_VERSION if terms_now else None,
            teacher_service_enabled=session.get("oauth_surface", "main") != "bookshop",
            bookshop_service_enabled=session.get("oauth_surface", "main") == "bookshop",
        )
        user.set_password(secrets.token_urlsafe(48), enable_login=False)
        db.session.add(user)
        db.session.flush()
        db.session.add(UserProfile(user_id=user.id))
        if terms_now:
            db.session.add(TermsAcceptance(
                user_id=user.id,
                terms_type="platform_terms",
                terms_version=CURRENT_TERMS_VERSION,
                privacy_version=CURRENT_TERMS_VERSION,
                accepted_at=terms_now,
                acceptance_source="oauth_signup",
            ))
        created = True

    # Create the AuthIdentity link
    db.session.add(AuthIdentity(
        user_id=user.id,
        provider=provider,
        provider_user_id=str(provider_user_id),
        email=email,
    ))
    db.session.commit()
    return user, created


def _login_and_redirect(user, frontend_path=None):
    surface = session.pop("oauth_surface", "main")
    session.pop("oauth_intent", None)
    session.pop("oauth_terms_accepted", None)
    if user.role and user.role.name == "user":
        if surface == "bookshop":
            user.bookshop_service_enabled = True
        else:
            user.teacher_service_enabled = True
    session.permanent = True
    login_user(user, remember=True)
    user.last_login_at = datetime.now(timezone.utc)
    db.session.commit()
    default_path = "/account" if surface == "bookshop" else "/portal"
    next_path = frontend_path or _safe_next(default_path)
    if user.terms_accepted_at is None:
        sep = "&" if "?" in next_path else "?"
        next_path = f"{next_path}{sep}terms=required"
    return redirect(f"{_frontend_base(surface)}{next_path}")


def _social_user_or_terms_error(user, provider):
    if user:
        return None
    surface = session.pop("oauth_surface", "main")
    intent = session.pop("oauth_intent", None)
    session.pop("oauth_terms_accepted", None)
    session.pop("oauth_next", None)
    signup_path = "/signup" if surface == "bookshop" else "/register"
    query = urlencode({"error": "account_not_found_social", "provider": provider})
    return redirect(f"{_frontend_base(surface)}{signup_path}?{query}")


def _oauth_failure(provider):
    surface = session.pop("oauth_surface", "main")
    session.pop("oauth_intent", None)
    session.pop("oauth_terms_accepted", None)
    session.pop("oauth_next", None)
    return redirect(f"{_frontend_base(surface)}/login?error={provider}_failed")


def _provider_not_configured(provider):
    surface = "bookshop" if request.args.get("surface") == "bookshop" else "main"
    login_path = "/login"
    return redirect(
        f"{_frontend_base(surface)}{login_path}?error=provider_unavailable&provider={provider}"
    )


# â”€â”€ Apple (Sign in with Apple) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Requires APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
# and HTTPS redirect URI. Works on VPS; not on localhost (Apple blocks HTTP).

@oauth_bp.get("/auth/apple")
def apple_login():
    handoff = _primary_auth_handoff()
    if handoff:
        return handoff
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
        user, _created = _get_or_create_user(
            provider="apple",
            provider_user_id=id_token.get("sub", ""),
            email=id_token.get("email", ""),
            first_name=info.get("name", {}).get("firstName", "") if isinstance(info.get("name"), dict) else "",
            last_name=info.get("name", {}).get("lastName", "") if isinstance(info.get("name"), dict) else "",
        )
        terms_error = _social_user_or_terms_error(user, "apple")
        if terms_error:
            return terms_error
        return _login_and_redirect(user)
    except Exception as exc:
        current_app.logger.warning("Apple OAuth callback failed: %s", exc)
        return _oauth_failure("apple")


# â”€â”€ Google â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@oauth_bp.get("/auth/google")
def google_login():
    handoff = _primary_auth_handoff()
    if handoff:
        return handoff
    if not current_app.config.get("GOOGLE_CLIENT_ID"):
        return _provider_not_configured("google")
    _remember_next("/portal")
    return oauth.google.authorize_redirect(_callback_url("google"))


@oauth_bp.get("/auth/google/callback")
def google_callback():
    try:
        token = oauth.google.authorize_access_token()
        info = token.get("userinfo") or oauth.google.userinfo()
        user, _created = _get_or_create_user(
            provider="google",
            provider_user_id=info["sub"],
            email=info.get("email", ""),
            first_name=info.get("given_name", ""),
            last_name=info.get("family_name", ""),
        )
        terms_error = _social_user_or_terms_error(user, "google")
        if terms_error:
            return terms_error
        return _login_and_redirect(user)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Google OAuth callback failed")
        return _oauth_failure("google")


# â”€â”€ Microsoft â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@oauth_bp.get("/auth/microsoft")
def microsoft_login():
    handoff = _primary_auth_handoff()
    if handoff:
        return handoff
    if not current_app.config.get("MICROSOFT_CLIENT_ID"):
        return _provider_not_configured("microsoft")
    _remember_next("/portal")
    return oauth.microsoft.authorize_redirect(_callback_url("microsoft"))


@oauth_bp.get("/auth/microsoft/callback")
def microsoft_callback():
    try:
        token = oauth.microsoft.authorize_access_token()
        info = token.get("userinfo") or {}
        user, _created = _get_or_create_user(
            provider="microsoft",
            provider_user_id=info.get("sub") or info.get("oid", ""),
            email=info.get("email") or info.get("preferred_username", ""),
            first_name=info.get("given_name", ""),
            last_name=info.get("family_name", ""),
        )
        terms_error = _social_user_or_terms_error(user, "microsoft")
        if terms_error:
            return terms_error
        return _login_and_redirect(user)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Microsoft OAuth callback failed")
        return _oauth_failure("microsoft")


# â”€â”€ Facebook â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@oauth_bp.get("/auth/facebook")
def facebook_login():
    handoff = _primary_auth_handoff()
    if handoff:
        return handoff
    if not current_app.config.get("FACEBOOK_APP_ID"):
        return _provider_not_configured("facebook")
    _remember_next("/portal")
    return oauth.facebook.authorize_redirect(_callback_url("facebook"))


@oauth_bp.get("/auth/facebook/callback")
def facebook_callback():
    try:
        oauth.facebook.authorize_access_token()
        resp = oauth.facebook.get("me?fields=id,name,email,first_name,last_name")
        info = resp.json()
        user, _created = _get_or_create_user(
            provider="facebook",
            provider_user_id=info["id"],
            email=info.get("email", ""),
            first_name=info.get("first_name", ""),
            last_name=info.get("last_name", ""),
        )
        terms_error = _social_user_or_terms_error(user, "facebook")
        if terms_error:
            return terms_error
        return _login_and_redirect(user)
    except Exception:
        db.session.rollback()
        current_app.logger.exception("Facebook OAuth callback failed")
        return _oauth_failure("facebook")
