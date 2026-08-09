from flask import Flask, jsonify, redirect, request, send_from_directory
from flask_wtf.csrf import CSRFError
from werkzeug.exceptions import RequestEntityTooLarge

from .api import register_api_blueprints
from .api.public import host_robots_response, host_sitemap_response, is_bookshop_host
from .cli import register_cli
from .config import Config
from .extensions import cors, csrf, db, limiter, login_manager, migrate
from .models import User
from .seo_pages import (
    bookshop_public_page,
    job_public_page,
    main_public_page,
    news_article_page,
    private_app_page,
    public_not_found_page,
    service_public_page,
)


def create_app(config_object=Config):
    app = Flask(__name__, instance_relative_config=False)
    app.config.from_object(config_object)

    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)
    limiter.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    register_api_blueprints(app)
    register_cli(app)

    from .backup import register_backup_commands
    register_backup_commands(app)

    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))

    # ---------- Legacy URL redirects ----------
    # Old site used /user/signup and /user/login. Google may still index those.
    # 301 redirects ensure link equity flows to the current SPA routes.
    @app.get("/user/signup")
    @app.get("/user/register")
    def redirect_old_signup():
        return redirect("/register", code=301)

    @app.get("/user/login")
    def redirect_old_login():
        return redirect("/login", code=301)

    @app.get("/health")
    def health():
        return jsonify(status="ok", service="realmindx-api")

    @app.get("/sitemap.xml")
    def sitemap():
        return host_sitemap_response()

    @app.get("/robots.txt")
    def robots():
        return host_robots_response()

    @app.get("/news/<slug>", strict_slashes=False)
    def news_article(slug):
        return news_article_page(slug)

    @app.get("/about", strict_slashes=False)
    @app.get("/services", strict_slashes=False)
    @app.get("/jobs", strict_slashes=False)
    @app.get("/contact", strict_slashes=False)
    @app.get("/news", strict_slashes=False)
    @app.get("/gallery", strict_slashes=False)
    @app.get("/resources", strict_slashes=False)
    @app.get("/donate", strict_slashes=False)
    @app.get("/privacy", strict_slashes=False)
    @app.get("/terms", strict_slashes=False)
    def public_page():
        path = request.path.strip("/")
        if is_bookshop_host():
            return bookshop_public_page(path)
        return main_public_page(path)

    @app.get("/services/<slug>", strict_slashes=False)
    def service_detail(slug):
        return service_public_page(slug)

    @app.get("/jobs/<segment>", strict_slashes=False)
    def job_detail(segment):
        return job_public_page(segment)

    @app.get("/login", strict_slashes=False)
    @app.get("/register", strict_slashes=False)
    @app.get("/signup", strict_slashes=False)
    @app.get("/forgot-password", strict_slashes=False)
    @app.get("/reset-password", strict_slashes=False)
    @app.get("/unsubscribe", strict_slashes=False)
    @app.get("/portal", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/portal/<path:tail>", strict_slashes=False)
    @app.get("/cart", strict_slashes=False)
    @app.get("/wishlist", strict_slashes=False)
    @app.get("/checkout", strict_slashes=False)
    @app.get("/account", strict_slashes=False)
    @app.get("/orders", strict_slashes=False)
    @app.get("/review", strict_slashes=False)
    @app.get("/request-book", strict_slashes=False)
    def private_frontend_page(tail=None):
        path = request.path.strip("/").split("/", 1)[0]
        bookshop_only = {"cart", "wishlist", "checkout", "account", "orders", "review", "request-book"}
        main_only = {"register", "forgot-password", "unsubscribe", "portal"}
        if (path in bookshop_only and not is_bookshop_host()) or (path in main_only and is_bookshop_host()):
            return public_not_found_page(request.path)
        return private_app_page(request.path)

    @app.get("/delivery-company", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/delivery-company/<path:tail>", strict_slashes=False)
    def delivery_company_portal_page(tail):
        return private_app_page(request.path)

    @app.get("/delivery", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/delivery/<path:tail>", strict_slashes=False)
    def rider_portal_page(tail):
        return private_app_page(request.path)

    @app.get("/manager", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/manager/", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/manager/<path:tail>", strict_slashes=False)
    def delivery_manager_subdomain_page(tail):
        return private_app_page(request.path)

    @app.get("/rider", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/rider/", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/rider/<path:tail>", strict_slashes=False)
    def delivery_rider_subdomain_page(tail):
        return private_app_page(request.path)

    @app.get("/admin", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/admin/<path:tail>", strict_slashes=False)
    def admin_portal_page(tail):
        return private_app_page(request.path)

    @app.get("/staff", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/staff/<path:tail>", strict_slashes=False)
    def staff_portal_page(tail):
        return private_app_page(request.path)

    @app.get("/", strict_slashes=False)
    def bookshop_root_page():
        if is_bookshop_host():
            return bookshop_public_page("")
        return main_public_page("")

    @app.get("/products", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/products/<path:tail>", strict_slashes=False)
    def bookshop_products_page(tail):
        return bookshop_public_page(f"products/{tail}".rstrip("/"))

    @app.get("/track", strict_slashes=False)
    @app.get("/track-order", strict_slashes=False)
    @app.get("/track-your-order", strict_slashes=False)
    @app.get("/invoice", strict_slashes=False)
    @app.get("/invoices", strict_slashes=False)
    @app.get("/documents", strict_slashes=False)
    @app.get("/documents/<path:tail>", strict_slashes=False)
    @app.get("/education-documents", strict_slashes=False)
    def bookshop_utility_page(tail=None):
        path = request.path.strip("/")
        if path in {"track-order", "track-your-order"}:
            return redirect("/track", code=301)
        if path == "invoices":
            return redirect("/invoice", code=301)
        if path == "education-documents":
            return redirect("/documents", code=301)
        return bookshop_public_page(path)

    @app.get("/collections/<segment>", strict_slashes=False)
    def bookshop_collection_page(segment):
        return bookshop_public_page(f"collections/{segment}")

    @app.get("/subjects", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/subjects/<path:tail>", strict_slashes=False)
    def bookshop_subjects_page(tail):
        return bookshop_public_page(f"subjects/{tail}".rstrip("/"))

    @app.get("/levels", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/levels/<path:tail>", strict_slashes=False)
    def bookshop_levels_page(tail):
        return bookshop_public_page(f"levels/{tail}".rstrip("/"))

    @app.get("/curriculum", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/curriculum/<path:tail>", strict_slashes=False)
    @app.get("/curricula", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/curricula/<path:tail>", strict_slashes=False)
    def bookshop_curriculum_page(tail):
        prefix = "curricula" if request.path.strip("/").startswith("curricula") else "curriculum"
        return bookshop_public_page(f"{prefix}/{tail}".rstrip("/"))

    @app.get("/categories", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/categories/<path:tail>", strict_slashes=False)
    def bookshop_categories_page(tail):
        return bookshop_public_page(f"categories/{tail}".rstrip("/"))

    @app.get("/publishers", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/publishers/<path:tail>", strict_slashes=False)
    def bookshop_publishers_page(tail):
        return bookshop_public_page(f"publishers/{tail}".rstrip("/"))

    @app.get("/bookshop", defaults={"tail": ""}, strict_slashes=False)
    @app.get("/bookshop/<path:tail>", strict_slashes=False)
    def legacy_bookshop_page(tail):
        suffix = f"/{tail}" if tail else "/"
        return redirect(f"https://bookshop.realmindxgh.com{suffix}", code=301)

    @app.get("/<path:unmatched_path>")
    def public_not_found(unmatched_path):
        return public_not_found_page(unmatched_path)

    @app.errorhandler(CSRFError)
    def handle_csrf_error(error):
        if request.path.startswith("/api/"):
            return jsonify(error="Security token expired. Please try again."), 400
        return jsonify(error=str(error.description)), 400

    @app.errorhandler(RequestEntityTooLarge)
    def handle_upload_too_large(error):
        if request.path.startswith("/api/"):
            maximum = int(app.config.get("MAX_UPLOAD_FILE_BYTES", 100 * 1024 * 1024)) // (1024 * 1024)
            return jsonify(error=f"The upload is too large. Maximum file size is {maximum} MB."), 413
        return jsonify(error="The upload is too large."), 413

    @app.get("/uploads/<path:filepath>")
    def serve_upload(filepath):
        """Serve uploaded files. In production nginx handles this instead."""
        import os
        upload_folder = app.config.get("UPLOAD_FOLDER", "")
        # Seeded design assets are used directly by public pages in local/dev,
        # while user documents stay protected unless the requester is signed in.
        public_prefixes = ("public/", "Redesign/")
        if not filepath.startswith(public_prefixes):
            from flask_login import current_user
            if not current_user.is_authenticated:
                return jsonify(error="Unauthorised"), 401
        response = send_from_directory(upload_folder, filepath)
        if filepath.startswith("public/images/") and filepath.lower().endswith((
            ".avif",
            ".gif",
            ".jpeg",
            ".jpg",
            ".png",
            ".webp",
        )):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


    return app
