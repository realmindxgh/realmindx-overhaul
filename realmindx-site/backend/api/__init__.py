from .admin import admin_bp
from .auth import auth_bp
from .bookshop import bookshop_bp
from .delivery import delivery_bp
from .jobs import jobs_bp
from .oauth import init_oauth, oauth_bp
from .profile import profile_bp
from .public import public_bp


def register_api_blueprints(app):
    app.register_blueprint(auth_bp, url_prefix="/api/auth")
    app.register_blueprint(public_bp, url_prefix="/api")
    app.register_blueprint(jobs_bp, url_prefix="/api")
    app.register_blueprint(profile_bp, url_prefix="/api")
    app.register_blueprint(bookshop_bp, url_prefix="/api")
    app.register_blueprint(delivery_bp, url_prefix="/api/delivery")
    app.register_blueprint(admin_bp, url_prefix="/api/admin")
    app.register_blueprint(oauth_bp, url_prefix="/api")
    init_oauth(app)
