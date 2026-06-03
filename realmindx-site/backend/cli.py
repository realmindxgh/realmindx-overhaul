import click
from flask import current_app

from .extensions import db
from .models import DeliveryZone, Permission, Role, User, UserProfile

# All Greater Accra towns — seeded with fee=0 so admin can set prices via the console
GREATER_ACCRA_TOWNS = [
    "Abeka", "Abelenkpe", "Abetinso", "Ablekuma", "Abokobi", "Abominya",
    "Abossey Okai", "Accra New Town", "Achimota", "Achimota Mile 7",
    "Achimota New Station", "Achiaman", "Ada Foah", "Ada Panya", "Adabraka",
    "Adenta", "Adenta Housing Down", "Adenta Housing Up", "Adjen Kotoku",
    "Adjiringanor", "Afienya", "Afiaman", "Agbenyegakope", "Agomeda",
    "Ahanya", "Ahwiam", "Airport Residential Area", "Akplabanya", "Akweteyman",
    "Alajo", "Alavanyo", "Alorkpem", "Amasaman", "Amlakpo", "Amrahia",
    "Anumle", "Anyaa", "Anyakpor", "Apenkwa", "Asaprochona", "Ashaiman",
    "Ashalaja", "Ashaley Botwe", "Ashieye (Ashiyie)", "Ashongman",
    "Ashongman Estates", "Asutsuare", "Asylum Down", "Atadeka", "Ayawaso",
    "Ayetepa", "Ayikuma", "Azizanya", "Baatsona", "Bawaleshie", "Big Ada",
    "Boi", "Bortianor", "Buaku", "Bubiashie", "Burma Camp", "Cantonments",
    "Chorkor", "Christiansborg", "Chuim", "Circle (Kwame Nkrumah Circle)",
    "Danchira", "Dansoman", "Darkuman", "Dawa", "Dawhenya", "Dodowa",
    "Dome", "Dome Pillar 2", "Doryumu", "Dzorwulu", "East Legon",
    "East Legon Hills", "Faajiemohe", "Fantevikope", "Fiakonya", "Frafraha",
    "Gbawe", "Gbegbe", "Gigedokum", "Goi", "Gomoa Fetteh", "Gonse",
    "Greda Estate", "Haatso", "Haatso Atomic", "Haatso Ecomog", "Huapa",
    "Jamestown", "Kajanya", "Kaneshie", "Kanda", "Kasunya", "Katamanso",
    "Kisseman", "Kodiabe", "Kokomlemle", "Kokrobitey", "Koluedor", "Kopodor",
    "Korle Gonno", "Kotobabi", "Kpatsedor", "Kpehe", "Kpetsupanya", "Kpone",
    "Kposi", "Kpotsum", "Kpongunor", "Kubekro", "Kunyenya", "Kutunse",
    "Kwabenya", "Kwashieman", "La", "La Bawaleshie", "La Wireless", "Labadi",
    "Langma", "Lapaz", "Lashibi", "Laterbiokorshie", "Legon", "Legon East",
    "Legon Hills", "Lekpongunor", "Lolonya", "Lorlorvor", "Lupunya",
    "Maajor", "Madina", "Magbomada", "Maledjor", "Mallam", "Mamobi",
    "Mampehia", "Mamprobi", "Mangotsonya", "Manhean", "Mantseman",
    "Manya Jorpanya", "Mataheko", "Matsekope", "Mayera", "McCarthy Hill",
    "Medie", "Michel Camp", "Minya", "Miotso", "Mlitsakpo", "Mpehuasem",
    "New Ningo", "Ngleshie Amanfro", "Nima", "Nkwantanang", "North Kaneshie",
    "North Legon", "Nsakina", "Nsuobri", "Nungua", "Nyapienya", "Nyigbenya",
    "Obakrowa", "Obeyeyie", "Oblogo", "Ocanseykope", "Odaw", "Odumse",
    "Ofankor", "Ofankor Barrier", "Okorhuem", "Okponglo", "Old Ashongman",
    "Old Ningo", "Onyansana", "Oshiyie", "Osu", "Osudoku", "Osuwem",
    "Otinibi", "Oyarifa", "Oyibi", "Pantang", "Papao", "Papase", "Pena",
    "Pokuase", "Prampram", "Pute", "Roman Ridge", "Sakumono", "Samsam",
    "Santeo", "Sege", "Sege Donya", "Sesemi", "Shai Hills Station",
    "Shiashie", "Some", "Songonya", "Sota", "Sowutuom", "Spintex", "Suapa",
    "Sugbanyate", "Taifa", "Tekpanya", "Tekpekope", "Tema", "Tesa",
    "Tesano", "Teshie", "Teshie-Nungua Estates", "Togbloku", "Totimekope",
    "Totope", "Tsokomey", "Tuba", "Vakpo", "Weija", "West Hills",
    "West Legon", "Wiaboman", "Wokumagbe", "Wuonyi", "Zenu", "Zanidaw",
]


DEFAULT_PERMISSIONS = [
    "manage_jobs",
    "view_applications",
    "manage_applications",
    "manage_users",
    "manage_products",
    "manage_orders",
    "manage_news",
    "manage_gallery",
    "manage_resources",
    "view_messages",
    "manage_newsletters",
    "manage_settings",
    "manage_admins",
    *[
        f"{area}.{action}"
        for area, actions in {
            "jobs": ["view", "create", "edit", "delete", "export"],
            "applications": ["view", "edit", "export"],
            "products": ["view", "create", "edit", "delete", "export"],
            "productReviews": ["view", "edit", "delete"],
            "categories": ["view", "create", "edit", "delete"],
            "flyers": ["view", "create", "edit", "delete"],
            "orders": ["view", "create", "edit", "delete", "export"],
            "services": ["view", "create", "edit", "delete"],
            "partners": ["view", "create", "edit", "delete"],
            "people": ["view", "create", "edit", "delete"],
            "homeHeroSlides": ["view", "create", "edit", "delete"],
            "donationSlides": ["view", "create", "edit", "delete"],
            "siteCopy": ["view", "create", "edit", "delete"],
            "news": ["view", "create", "edit", "delete"],
            "gallery": ["view", "create", "edit", "delete", "export"],
            "resources": ["view", "create", "edit", "delete", "export"],
            "messages": ["view", "edit", "delete"],
            "newsletters": ["view", "create", "edit", "delete", "export"],
            "alerts": ["view", "edit"],
            "settings": ["view", "create", "edit", "delete"],
            "admins": ["view", "create", "edit", "delete"],
            "staff": ["view", "create", "edit", "delete"],
            "auditLogs": ["view"],
        }.items()
        for action in actions
    ],
]


def ensure_role(name, description=""):
    role = Role.query.filter_by(name=name).first()
    if not role:
        role = Role(name=name, description=description)
        db.session.add(role)
    return role


def seed_permissions():
    permissions = {}
    for key in DEFAULT_PERMISSIONS:
        permission = Permission.query.filter_by(key=key).first()
        if not permission:
            permission = Permission(key=key, description=key.replace("_", " ").title())
            db.session.add(permission)
        permissions[key] = permission

    admin = ensure_role("admin", "Full RealMindX administration access.")
    staff = ensure_role("staff", "Permission-scoped staff account.")
    user = ensure_role("user", "Public applicant or customer account.")
    admin.permissions = list(permissions.values())
    db.session.flush()
    return admin, staff, user


def register_cli(app):
    @app.cli.command("seed-permissions")
    def seed_permissions_command():
        seed_permissions()
        db.session.commit()
        click.echo("Seeded RealMindX roles and permissions.")

    @app.cli.command("seed-admin")
    def seed_admin_command():
        admin_role, _, _ = seed_permissions()
        email = current_app.config.get("ADMIN_EMAIL")
        password = current_app.config.get("ADMIN_PASSWORD")
        first_name = current_app.config.get("ADMIN_FIRST_NAME", "RealMindX")
        last_name = current_app.config.get("ADMIN_LAST_NAME", "Admin")

        if not email or not password or password == "change-this-before-seeding":
            raise click.ClickException("Set ADMIN_EMAIL and a secure ADMIN_PASSWORD before seeding.")

        user = User.query.filter_by(email=email.lower()).first()
        if not user:
            user = User(
                email=email.lower(),
                first_name=first_name,
                last_name=last_name,
                role=admin_role,
                is_verified=True,
            )
            user.set_password(password)
            db.session.add(user)
            db.session.flush()
            db.session.add(UserProfile(user_id=user.id))
            action = "Created"
        else:
            user.role = admin_role
            user.is_verified = True
            action = "Updated"

        db.session.commit()
        click.echo(f"{action} admin account: {email.lower()}")

    @app.cli.command("seed-delivery-zones")
    @click.option("--region", default="greater-accra", help="Region to seed (default: greater-accra)")
    @click.option("--clear", is_flag=True, help="Remove existing zones first (use with caution)")
    def seed_delivery_zones_command(region, clear):
        """Seed delivery zones with fee=0. Set fees via Admin → Delivery Zones."""
        if clear:
            count = DeliveryZone.query.delete()
            db.session.commit()
            click.echo(f"Removed {count} existing delivery zones.")

        towns = GREATER_ACCRA_TOWNS if region == "greater-accra" else []
        if not towns:
            raise click.ClickException(f"Unknown region '{region}'. Currently only 'greater-accra' is available.")

        added = 0
        skipped = 0
        for i, town in enumerate(sorted(towns)):
            if DeliveryZone.query.filter_by(name=town).first():
                skipped += 1
                continue
            db.session.add(DeliveryZone(
                name=town,
                fee=0,
                description=f"Greater Accra — {town}. Set delivery fee in Admin → Delivery Zones.",
                sort_order=i + 1,
                is_active=True,
            ))
            added += 1

        db.session.commit()
        click.echo(
            f"Seeded {added} delivery zones (fee=0) for Greater Accra. "
            f"Skipped {skipped} that already existed. "
            f"Go to Admin → Bookshop → Delivery Zones to set the fees."
        )
