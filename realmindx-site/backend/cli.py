import click
from datetime import date
from markupsafe import escape
from flask import current_app
from sqlalchemy import or_

from .delivery_locations import format_location_aliases, normalize_location_key, split_location_aliases
from .extensions import db
from .models import DeliveryZone, Permission, Role, User, UserProfile
from .promo_affiliates import send_monthly_promo_statements
from .email_service import OutboundEmail, app_email_shell, send_email

# Baseline Greater Accra towns. Expanded delivery belts below add aliases,
# metadata, and suggested fees for the checkout search experience.
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


def _delivery_seed(
    name,
    aliases=None,
    region="Greater Accra",
    district="",
    nearby="",
    zone="Greater Accra delivery area",
    fee=0,
    description=None,
    delivery_area=True,
    alias_only=False,
):
    return {
        "name": name,
        "aliases": aliases or [],
        "region": region,
        "district_or_municipality": district,
        "nearby_major_town": nearby,
        "delivery_zone_label": zone,
        "fee": int(round(float(fee) / 5) * 5),
        "description": description,
        "is_delivery_area": delivery_area,
        "is_search_alias_only": alias_only,
    }


KASOA_META = {
    "region": "Central",
    "district": "Awutu Senya East / nearby Accra western edge",
    "nearby": "Kasoa",
    "zone": "Kasoa belt",
}
NSAWAM_META = {
    "region": "Eastern",
    "district": "Nsawam-Adoagyiri area",
    "nearby": "Nsawam",
    "zone": "Nsawam belt",
}
ABURI_META = {
    "region": "Eastern",
    "district": "Akuapem South / Akuapem area",
    "nearby": "Aburi",
    "zone": "Aburi belt",
}
SAPEIMAN_META = {
    "region": "Greater Accra",
    "district": "Ga West / Pokuase / Amasaman area",
    "nearby": "Sapeiman",
    "zone": "Sapeiman / Ga West belt",
}
KPONG_META = {
    "region": "Eastern",
    "district": "Lower Manya Krobo / Eastern corridor",
    "nearby": "Kpong",
    "zone": "Kpong corridor",
}


REQUESTED_DELIVERY_LOCATIONS = [
    _delivery_seed("Kasoa", fee=70, **KASOA_META),
    _delivery_seed("Odupongkpehe", aliases=["Oduponkpehe", "Odupong Kpehe", "Odupon Kpehe"], fee=70, **KASOA_META),
    _delivery_seed("Ofaakor", fee=70, **KASOA_META),
    _delivery_seed("Akweley", fee=70, **KASOA_META),
    _delivery_seed("Opeikuma", fee=70, **KASOA_META),
    _delivery_seed("Walantu", fee=70, **KASOA_META),
    _delivery_seed("Kpormetey", fee=70, **KASOA_META),
    _delivery_seed("Kasoa Zongo", aliases=["Zongo"], fee=70, **KASOA_META),
    _delivery_seed("Adam Nana", fee=70, **KASOA_META),
    _delivery_seed("Millennium City", fee=70, **KASOA_META),
    _delivery_seed("Galilea", fee=70, **KASOA_META),
    _delivery_seed("Nyanyano", fee=80, **KASOA_META),
    _delivery_seed("New Nyanyano", fee=80, **KASOA_META),
    _delivery_seed("Old Barrier", aliases=["Kasoa Old Barrier"], fee=65, **KASOA_META),
    _delivery_seed("CP", fee=70, **KASOA_META),
    _delivery_seed("Blue Top", fee=70, **KASOA_META),
    _delivery_seed("Iron City", fee=70, **KASOA_META),
    _delivery_seed("Toll Booth", fee=70, **KASOA_META),
    _delivery_seed("Buduburam", aliases=["Gomoa Buduburam", "Liberia Camp"], fee=75, **KASOA_META),
    _delivery_seed("Fetteh Kakraba", fee=80, **KASOA_META),
    _delivery_seed("Tuba", aliases=["Tuba Junction"], fee=60, **KASOA_META),
    _delivery_seed("Jei Krodua", fee=75, **KASOA_META),
    _delivery_seed("Ngleshie Amanfro", aliases=["Amanfrom", "Amanfro", "Kasoa Amanfrom"], fee=65, **KASOA_META),
    _delivery_seed("Obom Road", fee=70, **KASOA_META),
    _delivery_seed("Kokrobitey", aliases=["Kokrobite Junction", "Kokrobite"], fee=55, **KASOA_META),
    _delivery_seed("Broadcastle Road", fee=70, **KASOA_META),
    _delivery_seed("Kpong", fee=200, **KPONG_META),
    _delivery_seed("Nsawam", fee=70, **NSAWAM_META),
    _delivery_seed("Adoagyiri", aliases=["Nsawam Adoagyiri"], fee=70, **NSAWAM_META),
    _delivery_seed("Dobro", fee=60, **NSAWAM_META),
    _delivery_seed("Fotobi", fee=75, **NSAWAM_META),
    _delivery_seed("Akwakupom", fee=80, **NSAWAM_META),
    _delivery_seed("Pakro", fee=90, **NSAWAM_META),
    _delivery_seed("Asiaw-Krom", aliases=["Asiaw Krom"], fee=80, **NSAWAM_META),
    _delivery_seed("Nkyenekyene", fee=80, **NSAWAM_META),
    _delivery_seed("Ahodjo", fee=75, **NSAWAM_META),
    _delivery_seed("Adoagyiri Zongo", fee=70, **NSAWAM_META),
    _delivery_seed("Nsawam Prisons Area", fee=70, **NSAWAM_META),
    _delivery_seed("Nsawam Road", fee=65, **NSAWAM_META),
    _delivery_seed("Okobeyeyie", fee=70, **NSAWAM_META),
    _delivery_seed("Kyekyewere", fee=80, **NSAWAM_META),
    _delivery_seed("Darmang", fee=80, **NSAWAM_META),
    _delivery_seed("Ankwa Dobro", fee=70, **NSAWAM_META),
    _delivery_seed("Teacher Mante", fee=100, **NSAWAM_META),
    _delivery_seed("Anoff", fee=80, **NSAWAM_META),
    _delivery_seed("Adeiso Road", fee=90, **NSAWAM_META),
    _delivery_seed("Sakyikrom", fee=80, **NSAWAM_META),
    _delivery_seed("Ntoaso", fee=80, **NSAWAM_META),
    _delivery_seed("Pampamso", fee=80, **NSAWAM_META),
    _delivery_seed("Amanfrom Nsawam", fee=80, **NSAWAM_META),
    _delivery_seed("Asuboi", fee=100, **NSAWAM_META),
    _delivery_seed("Pokrom", fee=90, **NSAWAM_META),
    _delivery_seed("Adoagyiri Market Area", fee=70, **NSAWAM_META),
    _delivery_seed("Aburi", fee=60, **ABURI_META),
    _delivery_seed("Peduase", aliases=["Peduase Lodge Area"], fee=45, **ABURI_META),
    _delivery_seed("Kitase", aliases=["Kitasi", "Dome-Kitase", "Dome Kitase", "Dome-Kitase Road"], fee=45, **ABURI_META),
    _delivery_seed("Ahwerase", fee=60, **ABURI_META),
    _delivery_seed("Adomorobe", aliases=["Adamorobe"], fee=60, **ABURI_META),
    _delivery_seed("Berekuso", fee=60, **ABURI_META),
    _delivery_seed("Konkonuru", fee=65, **ABURI_META),
    _delivery_seed("Nsakye", fee=55, **ABURI_META),
    _delivery_seed("Attakrom", fee=60, **ABURI_META),
    _delivery_seed("Ayim", fee=65, **ABURI_META),
    _delivery_seed("Gyankama", fee=60, **ABURI_META),
    _delivery_seed("Obosomase", fee=70, **ABURI_META),
    _delivery_seed("Mampong Akuapem", fee=75, **ABURI_META),
    _delivery_seed("Mamfe", fee=80, **ABURI_META),
    _delivery_seed("Tutu", fee=80, **ABURI_META),
    _delivery_seed("Amanokrom", fee=90, **ABURI_META),
    _delivery_seed("Akropong", fee=90, **ABURI_META),
    _delivery_seed("Larteh", fee=100, **ABURI_META),
    _delivery_seed("Adukrom", fee=100, **ABURI_META),
    _delivery_seed("Apirede", fee=100, **ABURI_META),
    _delivery_seed("Abonse", fee=100, **ABURI_META),
    _delivery_seed("Dago", fee=80, **ABURI_META),
    _delivery_seed("Agyementi", fee=75, **ABURI_META),
    _delivery_seed("Aburi Amanfo", fee=60, **ABURI_META),
    _delivery_seed("Aburi Botanical Gardens Area", fee=60, **ABURI_META),
    _delivery_seed("Aburi Girls Area", fee=60, **ABURI_META),
    _delivery_seed("Sapeiman", aliases=["Sarpeiman", "Sarpiman"], fee=35, **SAPEIMAN_META),
    _delivery_seed("Ayikai Doblo", fee=40, **SAPEIMAN_META),
    _delivery_seed("Doblo", aliases=["Doblogonno"], fee=40, **SAPEIMAN_META),
    _delivery_seed("Kotoku", fee=40, **SAPEIMAN_META),
    _delivery_seed("ACP Estate", aliases=["Pokuase ACP"], fee=35, **SAPEIMAN_META),
    _delivery_seed("Afuaman", fee=40, **SAPEIMAN_META),
    _delivery_seed("Kojo Ashong", aliases=["Kwadjo Ashong"], fee=45, **SAPEIMAN_META),
    _delivery_seed("Oduman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Nsakina", aliases=["Nsakyina"], fee=40, **SAPEIMAN_META),
    _delivery_seed("Dedeiman", fee=40, **SAPEIMAN_META),
    _delivery_seed("Dome Faase", fee=45, **SAPEIMAN_META),
    _delivery_seed("Dome Sampaman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Katapor", fee=45, **SAPEIMAN_META),
    _delivery_seed("Mantsi", fee=45, **SAPEIMAN_META),
    _delivery_seed("Pobiman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Torman", fee=40, **SAPEIMAN_META),
    _delivery_seed("Akotoshie", fee=45, **SAPEIMAN_META),
    _delivery_seed("Akramaman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Ardeyman", fee=40, **SAPEIMAN_META),
    _delivery_seed("Adusa", aliases=["Adusa Quarters"], fee=45, **SAPEIMAN_META),
    _delivery_seed("Osofoman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Okushibiade", fee=45, **SAPEIMAN_META),
    _delivery_seed("Nii Aboman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Koleman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Koteman", fee=45, **SAPEIMAN_META),
    _delivery_seed("Kwashiekuma", fee=45, **SAPEIMAN_META),
    _delivery_seed("Samsam Odumase", fee=45, **SAPEIMAN_META),
    _delivery_seed("Opah", fee=45, **SAPEIMAN_META),
]


def _default_delivery_seed(town):
    return _delivery_seed(
        town,
        description=f"Greater Accra delivery area: {town}.",
        delivery_area=town != "Dome Pillar 2",
    )


def delivery_zone_seed_items():
    seeds_by_key = {
        normalize_location_key(town): _default_delivery_seed(town)
        for town in GREATER_ACCRA_TOWNS
    }
    for location in REQUESTED_DELIVERY_LOCATIONS:
        seeds_by_key[normalize_location_key(location["name"])] = location
    return sorted(seeds_by_key.values(), key=lambda item: normalize_location_key(item["name"]))


def _seed_description(seed):
    return seed["description"] or f"{seed['delivery_zone_label']}: estimated delivery fee from Dome Pillar 2."


def _should_replace_seed_description(description):
    text = str(description or "").strip()
    return not text or text.startswith("Greater Accra: ") or "Set delivery fee in Admin under Delivery Zones" in text


def _seed_alias_text(seed, existing_aliases=None):
    aliases = [*split_location_aliases(existing_aliases), *seed["aliases"]]
    return format_location_aliases(aliases, seed["name"])


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
    "delivery.view",
    "delivery.assign",
    "delivery.companies.manage",
    "delivery.audit.view",
    "delivery.override_otp",
    "delivery.settlements.view",
    "delivery.settlements.manage",
    "delivery.settlements.export",
    "delivery.settlements.adjust",
    "delivery.settlements.mark_paid",
    "delivery.settlements.dispute_resolve",
    "bookRequests.view",
    "bookRequests.manage",
    *[
        f"{area}.{action}"
        for area, actions in {
            "jobs": ["view", "create", "edit", "delete", "export"],
            "applications": ["view", "edit", "export"],
            "products": ["view", "create", "edit", "delete", "export"],
            "productReviews": ["view", "edit", "delete"],
            "categories": ["view", "create", "edit", "delete"],
            "flyers": ["view", "create", "edit", "delete"],
            "deliveryZones": ["view", "create", "edit", "delete"],
            "priceAdjustment": ["view", "edit"],
            "orders": ["view", "create", "edit", "delete", "export"],
            "orderReviews": ["view", "edit", "delete"],
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
            "analytics": ["view", "export"],
            "settings": ["view", "create", "edit", "delete"],
            "admins": ["view", "create", "edit", "delete"],
            "staff": ["view", "create", "edit", "delete"],
            "teachers": ["view", "edit", "export", "delete"],
            "auditLogs": ["view"],
            "uploads": ["create"],
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
    ensure_role("delivery_company_user", "Delivery company portal user.")
    ensure_role("delivery_rider", "Delivery rider portal user.")
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

    @app.cli.command("send-promo-statements")
    @click.option("--month", default=None, help="Statement month in YYYY-MM format. Defaults to the previous calendar month.")
    def send_promo_statements_command(month):
        today = date.today()
        if month:
            try:
                year, month_number = [int(part) for part in month.split("-", 1)]
            except (TypeError, ValueError):
                raise click.ClickException("Use --month in YYYY-MM format.")
        else:
            if today.month == 1:
                year, month_number = today.year - 1, 12
            else:
                year, month_number = today.year, today.month - 1
        result = send_monthly_promo_statements(year, month_number)
        click.echo(
            f"Sent {result['affiliate_count']} affiliate statement(s) "
            f"covering {result['usage_count']} completed promo sale(s)."
        )

    @app.cli.command("send-cart-invoice-reminders")
    def send_cart_invoice_reminders_command():
        """Send due 3-day and 10-day reminders for unconverted cart invoices."""
        from .api.bookshop import send_due_cart_invoice_reminders

        sent = send_due_cart_invoice_reminders()
        click.echo(f"Sent {sent} cart invoice reminder email(s).")

    @app.cli.command("send-teacher-profile-reminders")
    @click.option("--force", is_flag=True, help="Allow a manual run outside August 2027 or later.")
    def send_teacher_profile_reminders_command(force):
        today = date.today()
        if not force and (today.year < 2027 or today.month != 8):
            click.echo("Teacher profile reminders run only in August, starting in 2027.")
            return
        teacher_role = Role.query.filter_by(name="user").first()
        if not teacher_role:
            click.echo("No teacher role exists.")
            return
        users = User.query.filter_by(role_id=teacher_role.id, is_active=True).filter(or_(
            User.profile_reminder_sent_year.is_(None),
            User.profile_reminder_sent_year != today.year,
        )).all()
        sent = 0
        portal_url = f"{current_app.config['BASE_URL'].rstrip('/')}/portal/profile"
        for user in users:
            result = send_email(OutboundEmail(
                to=user.email,
                subject="Please review your RealMindX teaching profile",
                html=app_email_shell(
                    "Keep your teaching profile current",
                    f"<p>Hello {escape(user.first_name or 'Teacher')},</p><p>Schools make better matches when your subjects, experience, location, availability, age range, and other profile details are current. Please review your RealMindX profile for the new school year.</p>",
                    "Review My Profile", portal_url,
                    eyebrow="Annual Teacher Profile Review",
                    preheader="Update your profile to improve future job matches.",
                ),
                text=f"Review and update your RealMindX teaching profile: {portal_url}",
            ))
            if result.get("status") == "sent":
                user.profile_reminder_sent_year = today.year
                sent += 1
        db.session.commit()
        click.echo(f"Sent {sent} teacher profile reminder(s) for {today.year}.")

    @app.cli.command("seed-delivery-zones")
    @click.option(
        "--region",
        default="greater-accra",
        help="Seed set to use (default: greater-accra; includes nearby Kasoa, Nsawam, Aburi, and Sapeiman belts)",
    )
    @click.option("--clear", is_flag=True, help="Remove existing zones first (use with caution)")
    def seed_delivery_zones_command(region, clear):
        """Seed delivery zones. Adjust fees via Admin > Bookshop > Delivery Prices."""
        if clear:
            count = DeliveryZone.query.delete()
            db.session.commit()
            click.echo(f"Removed {count} existing delivery zones.")

        if region not in {"greater-accra", "all"}:
            raise click.ClickException(
                f"Unknown region '{region}'. Currently only 'greater-accra' and 'all' are available."
            )

        seeds = delivery_zone_seed_items()
        added = 0
        updated = 0
        skipped = 0
        for i, seed in enumerate(seeds):
            zone = DeliveryZone.query.filter_by(name=seed["name"]).first()
            if zone:
                changes = {
                    "aliases": _seed_alias_text(seed, zone.aliases),
                    "region": seed["region"],
                    "district_or_municipality": seed["district_or_municipality"],
                    "nearby_major_town": seed["nearby_major_town"],
                    "delivery_zone_label": seed["delivery_zone_label"],
                    "is_delivery_area": seed["is_delivery_area"],
                    "is_search_alias_only": seed["is_search_alias_only"],
                }
                if _should_replace_seed_description(zone.description):
                    changes["description"] = _seed_description(seed)
                if not zone.sort_order:
                    changes["sort_order"] = i + 1
                changed = False
                for field, value in changes.items():
                    if getattr(zone, field) != value:
                        setattr(zone, field, value)
                        changed = True
                if changed:
                    updated += 1
                else:
                    skipped += 1
                continue
            db.session.add(DeliveryZone(
                name=seed["name"],
                fee=seed["fee"],
                description=_seed_description(seed),
                aliases=_seed_alias_text(seed),
                region=seed["region"],
                district_or_municipality=seed["district_or_municipality"],
                nearby_major_town=seed["nearby_major_town"],
                delivery_zone_label=seed["delivery_zone_label"],
                is_delivery_area=seed["is_delivery_area"],
                is_search_alias_only=seed["is_search_alias_only"],
                sort_order=i + 1,
                is_active=True,
            ))
            added += 1

        db.session.commit()
        click.echo(
            f"Seeded {added} delivery zones for Greater Accra and nearby delivery belts. "
            f"Updated {updated} existing zones with aliases/metadata. "
            f"Skipped {skipped} already current zones. "
            f"Go to Admin > Bookshop > Delivery Prices to set the fees."
        )
