from flask import Flask, jsonify, request, send_from_directory
from flask_wtf.csrf import CSRFError

from .api import register_api_blueprints
from .cli import register_cli
from .config import Config
from .extensions import cors, csrf, db, limiter, login_manager, migrate
from .models import User


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

    @app.get("/health")
    def health():
        return jsonify(status="ok", service="realmindx-api")

    @app.errorhandler(CSRFError)
    def handle_csrf_error(error):
        if request.path.startswith("/api/"):
            return jsonify(error="Security token expired. Please try again."), 400
        return jsonify(error=str(error.description)), 400

    @app.get("/uploads/<path:filepath>")
    def serve_upload(filepath):
        """Serve uploaded files. In production nginx handles this instead."""
        import os
        upload_folder = app.config.get("UPLOAD_FOLDER", "")
        # Only serve files from the public subfolder without authentication
        if not filepath.startswith("public/"):
            from flask_login import current_user
            if not current_user.is_authenticated:
                return jsonify(error="Unauthorised"), 401
        return send_from_directory(upload_folder, filepath)


    return app
