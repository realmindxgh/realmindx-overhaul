import os
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")


def _bool_env(name, default=False):
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://realmindx:realmindx@127.0.0.1:5432/realmindx",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5173")
    BOOKSHOP_URL = os.getenv("BOOKSHOP_URL", f"{BASE_URL}/bookshop")
    API_URL = os.getenv("API_URL", "http://127.0.0.1:5000/api")
    FRONTEND_DIST_DIR = os.getenv("FRONTEND_DIST_DIR", str(BASE_DIR.parent / "dist"))
    GEOIP_DATABASE_PATH = os.getenv(
        "GEOIP_DATABASE_PATH",
        "/var/lib/realmindx/geoip/dbip-city-lite.mmdb",
    )
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",")
        if origin.strip()
    ]

    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    SESSION_COOKIE_SECURE = _bool_env("SESSION_COOKIE_SECURE", False)
    REMEMBER_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_SECURE = SESSION_COOKIE_SECURE

    WTF_CSRF_TIME_LIMIT = int(os.getenv("WTF_CSRF_TIME_LIMIT", "3600"))
    # REST API routes are already protected by CORS + session auth.
    # Disable automatic CSRF checking — the API has no HTML form POST targets.
    WTF_CSRF_CHECK_DEFAULT = False
    WTF_CSRF_TRUSTED_ORIGINS = [
        "https://realmindxgh.com",
        "https://www.realmindxgh.com",
        "https://bookshop.realmindxgh.com",
        "https://new.realmindxgh.com",
    ]
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")

    UPLOAD_FOLDER = os.getenv("UPLOAD_FOLDER", str(BASE_DIR / "uploads"))
    MAX_CONTENT_LENGTH = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
    ALLOWED_UPLOAD_EXTENSIONS = {
        "images": {"jpg", "jpeg", "png", "webp"},
        "documents": {"pdf", "doc", "docx", "odt", "rtf"},
        "resources": {"pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "csv"},
    }

    DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "RealMindX <notifications@send.realmindxgh.com>")
    ADMIN_CC_EMAIL = os.getenv("ADMIN_CC_EMAIL", "realmindxgh@gmail.com")  # secondary inbox CC
    DEFAULT_REPLY_TO_EMAIL = os.getenv("DEFAULT_REPLY_TO_EMAIL", "info@realmindxgh.com")
    JOBS_FROM_EMAIL = os.getenv("JOBS_FROM_EMAIL", "RealMindX Jobs <jobs@send.realmindxgh.com>")
    BOOKSHOP_FROM_EMAIL = os.getenv("BOOKSHOP_FROM_EMAIL", "RealMindX Bookshop <bookshop@send.realmindxgh.com>")
    NEWSLETTER_FROM_EMAIL = os.getenv("NEWSLETTER_FROM_EMAIL", "RealMindX Updates <notifications@send.realmindxgh.com>")
    RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
    PAYSTACK_SECRET_KEY = os.getenv("PAYSTACK_SECRET_KEY", "")
    PAYSTACK_PUBLIC_KEY = os.getenv("PAYSTACK_PUBLIC_KEY", "")
    MAIL_SERVER = os.getenv("MAIL_SERVER", "")
    MAIL_PORT = int(os.getenv("MAIL_PORT", "587"))
    MAIL_USE_TLS = _bool_env("MAIL_USE_TLS", True)
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "")

    TURNSTILE_SECRET_KEY = os.getenv("TURNSTILE_SECRET_KEY", "")

    # Arkesel SMS (Ghana) — set these when ready; SMS is silently skipped if blank
    ARKESEL_API_KEY   = os.getenv("ARKESEL_API_KEY", "")
    ARKESEL_SENDER_ID = os.getenv("ARKESEL_SENDER_ID", "RealMindX")

    # OAuth social login
    GOOGLE_CLIENT_ID     = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
    MICROSOFT_CLIENT_ID     = os.getenv("MICROSOFT_CLIENT_ID", "")
    MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
    MICROSOFT_TENANT_ID     = os.getenv("MICROSOFT_TENANT_ID", "common")
    FACEBOOK_APP_ID     = os.getenv("FACEBOOK_APP_ID", "")
    FACEBOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")
    # Apple Sign In (requires HTTPS - works on VPS, not localhost)
    APPLE_CLIENT_ID  = os.getenv("APPLE_CLIENT_ID", "")   # Services ID, e.g. com.realmindxgh.auth
    APPLE_TEAM_ID    = os.getenv("APPLE_TEAM_ID", "")
    APPLE_KEY_ID     = os.getenv("APPLE_KEY_ID", "")
    APPLE_PRIVATE_KEY = os.getenv("APPLE_PRIVATE_KEY", "")  # contents of the .p8 file

    # Google Drive backup (optional — set these for automated backups)
    GOOGLE_DRIVE_CREDENTIALS_JSON = os.getenv("GOOGLE_DRIVE_CREDENTIALS_JSON", "")
    GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")

    ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "")
    ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "")
    ADMIN_FIRST_NAME = os.getenv("ADMIN_FIRST_NAME", "RealMindX")
    ADMIN_LAST_NAME = os.getenv("ADMIN_LAST_NAME", "Admin")
