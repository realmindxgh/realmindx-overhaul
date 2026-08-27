import click
from datetime import date, datetime, timezone
from markupsafe import escape
from flask import current_app
from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from .delivery_locations import format_location_aliases, normalize_location_key, split_location_aliases
from .contacts import normalize_contact_email, upsert_contact
from .extensions import db
from .image_variants import ensure_product_image_variants, product_image_variant_status
from .models import Contact, ContactChangeToken, ContactMessage, DeliveryZone, NewsletterSubscriber, Order, Permission, Product, Role, User, UserProfile
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
            "contacts": ["view", "create", "edit", "email"],
            "newsletters": ["view", "create", "edit", "delete", "export"],
            "alerts": ["view", "edit"],
            "analytics": ["view", "export"],
            "settings": ["view", "create", "edit", "delete"],
            "admins": ["view", "create", "edit", "delete"],
            "staff": ["view", "create", "edit", "delete"],
            "teachers": ["view", "edit", "export", "delete", "account.manage", "documents.manage", "verification.manage"],
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
    @app.cli.command("backfill-contacts")
    @click.option("--apply", "apply_changes", is_flag=True, help="Persist the idempotent backfill. Without this flag the command is a dry run.")
    def backfill_contacts_command(apply_changes):
        teacher_rows = (
            User.query.join(User.role)
            .filter(Role.name == "user", User.teacher_service_enabled.is_(True))
            .all()
        )
        order_rows = Order.query.all()
        newsletter_rows = NewsletterSubscriber.query.all()
        enquiry_rows = ContactMessage.query.all()
        source_emails = {
            "teacher": [row.email for row in teacher_rows if row.email],
            "bookshop": [row.email for row in order_rows if row.email],
            "newsletter": [row.email for row in newsletter_rows if row.email],
            "enquiry": [row.email for row in enquiry_rows if row.email],
        }
        normalized = {
            source: {normalize_contact_email(email) for email in emails}
            for source, emails in source_emails.items()
        }
        union = set().union(*normalized.values()) if normalized else set()
        click.echo("Contact backfill dry run" if not apply_changes else "Applying contact backfill")
        for source, emails in source_emails.items():
            click.echo(f"{source}: rows={len(emails)} unique={len(normalized[source])} duplicates={len(emails) - len(normalized[source])}")
        click.echo(f"unique_contacts={len(union)} existing_contacts={Contact.query.count()}")
        for left, right in (("teacher", "bookshop"), ("teacher", "newsletter"), ("bookshop", "newsletter")):
            click.echo(f"overlap_{left}_{right}={len(normalized[left] & normalized[right])}")
        if not apply_changes:
            return

        for user in teacher_rows:
            upsert_contact(
                user.email,
                full_name=user.full_name,
                phone=user.phone,
                source="teacher",
                source_record_id=user.id,
                metadata={"application_id": user.application_id},
                activity_at=user.last_login_at or user.updated_at or user.created_at,
            )
        for order in order_rows:
            upsert_contact(
                order.email,
                full_name=order.customer_name,
                phone=order.phone,
                source="bookshop",
                source_record_id=order.id,
                metadata={"latest_order_id": order.id, "latest_order_reference": order.order_reference},
                activity_at=order.paid_at or order.updated_at or order.created_at,
            )
        for subscriber in newsletter_rows:
            origins = set(subscriber.sources or [subscriber.source])
            contact = upsert_contact(
                subscriber.email,
                source="newsletter",
                source_record_id=subscriber.id,
                metadata={"signup_sources": sorted(origins)},
                activity_at=subscriber.updated_at or subscriber.created_at,
            )
            subscriber.contact = contact
        for message in enquiry_rows:
            upsert_contact(
                message.email,
                full_name=message.name,
                phone=message.phone,
                source="enquiry",
                source_record_id=message.id,
                metadata={"ticket_reference": message.ticket_reference, "service": message.source},
                activity_at=message.updated_at or message.created_at,
            )
        db.session.commit()
        click.echo(f"Backfill complete: contacts={Contact.query.count()}")

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
        if result.get("mocked"):
            click.echo(f"Recorded {result['mocked']} statement(s) in mock mode; no email was sent.")
        if result.get("failed"):
            click.echo(f"Failed to deliver {result['failed']} statement(s).")

    @app.cli.command("send-cart-invoice-reminders")
    def send_cart_invoice_reminders_command():
        """Send due 3-day and 10-day reminders for unconverted cart invoices."""
        from .api.bookshop import send_due_cart_invoice_reminders

        sent = send_due_cart_invoice_reminders()
        click.echo(f"Sent {sent} cart invoice reminder email(s).")

    @app.cli.command("send-profile-completion-reminders")
    def send_profile_completion_reminders_command():
        """Send due completion, submission, and revision reminders."""
        from .api.admin import send_due_teacher_profile_completion_reminders

        result = send_due_teacher_profile_completion_reminders()
        click.echo(
            "Teacher profile reminders: "
            f"{result['due']} due, {result['accepted']} accepted, "
            f"{result['mocked']} mocked, {result['failed']} failed, "
            f"{result['skipped']} skipped; "
            f"completion={result['kinds']['completion']}, "
            f"submission={result['kinds']['submission']}, "
            f"revision={result['kinds']['revision']}."
        )

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
        accepted = 0
        mocked = 0
        skipped = 0
        portal_url = f"{current_app.config['BASE_URL'].rstrip('/')}/portal/profile"
        for user in users:
            result = send_email(
                OutboundEmail(
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
                ),
                purpose="service_reminder",
                recipient_user_id=user.id,
                template_name="annual_profile_reminder",
            )
            if result.status in ("accepted", "sent"):
                user.profile_reminder_sent_year = today.year
                accepted += 1
            elif result.status == "mocked":
                mocked += 1
            else:
                skipped += 1
        db.session.commit()
        click.echo(f"Annual reminders: {accepted} accepted, {mocked} mocked, {skipped} skipped (for {today.year}).")

    @app.cli.command("backfill-product-image-variants")
    @click.option("--dry-run", is_flag=True, help="List product image work without creating files or updating rows.")
    @click.option("--limit", type=int, default=None, help="Maximum number of products to inspect.")
    @click.option("--include-drafts", is_flag=True, help="Also inspect unpublished products.")
    def backfill_product_image_variants_command(dry_run, limit, include_drafts):
        """Generate missing WebP thumbnail and medium variants for existing product images."""
        query = Product.query.options(
            joinedload(Product.image_file),
            joinedload(Product.image_original_file),
            joinedload(Product.image_medium_file),
            joinedload(Product.image_thumb_file),
        ).order_by(Product.id.asc())
        if not include_drafts:
            query = query.filter(Product.is_active.is_(True))
        if limit:
            query = query.limit(limit)

        products = query.all()
        counts = {
            "inspected": len(products),
            "already_optimized": 0,
            "missing_source": 0,
            "would_generate": 0,
            "generated": 0,
            "failed": 0,
        }

        for product in products:
            if not product.image_file_id:
                counts["missing_source"] += 1
                click.echo(f"skip product #{product.id}: no original image")
                continue

            status = product_image_variant_status(product)
            if not status["source_exists"]:
                counts["missing_source"] += 1
                click.echo(f"skip product #{product.id}: original image file is missing")
                continue

            missing = status["missing"]
            if not missing:
                counts["already_optimized"] += 1
                continue

            if dry_run:
                counts["would_generate"] += 1
                click.echo(f"would generate {', '.join(missing)} for product #{product.id}: {product.name}")
                continue

            result = ensure_product_image_variants(product)
            if result["status"] == "ok":
                db.session.commit()
                counts["generated"] += 1
                created = ", ".join(result["created"]) or "none"
                skipped = ", ".join(result["skipped"]) or "none"
                click.echo(f"generated product #{product.id}: created={created}; skipped={skipped}")
            else:
                db.session.rollback()
                counts["failed"] += 1
                click.echo(f"failed product #{product.id}: {result['error']}")

        mode = "DRY RUN" if dry_run else "DONE"
        click.echo(
            f"{mode}: inspected={counts['inspected']}, "
            f"already_optimized={counts['already_optimized']}, "
            f"missing_source={counts['missing_source']}, "
            f"would_generate={counts['would_generate']}, "
            f"generated={counts['generated']}, failed={counts['failed']}"
        )

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

    @app.cli.command("communications-health")
    @click.argument("channel", default="email")
    @click.option("--send-test", default=None, help="Send a real test message to this recipient (use with caution).")
    def communications_health_command(channel, send_test):
        """Check communication provider configuration without sending by default."""
        from ..communications import resolve_communication_mode, CommunicationAttempt

        mode = resolve_communication_mode()
        click.echo(f"Communication mode: {mode}")
        click.echo("")

        if channel == "email":
            resend_key = current_app.config.get("RESEND_API_KEY", "")
            mail_server = current_app.config.get("MAIL_SERVER", "")
            mail_username = current_app.config.get("MAIL_USERNAME", "")
            mail_password = current_app.config.get("MAIL_PASSWORD", "")
            from_email = current_app.config.get("DEFAULT_FROM_EMAIL", "")

            click.echo("Email provider configuration:")
            click.echo(f"  Resend API key: {'SET' if resend_key else 'NOT SET'}")
            click.echo(f"  SMTP server: {'SET' if mail_server else 'NOT SET'}")
            click.echo(f"  SMTP username: {'SET' if mail_username else 'NOT SET'}")
            click.echo(f"  SMTP password: {'SET' if bool(mail_password) else 'NOT SET'}")
            click.echo(f"  Default from: {from_email}")

            recent = CommunicationAttempt.query.filter_by(
                channel="email",
            ).order_by(CommunicationAttempt.requested_at.desc()).limit(5).all()
            click.echo("")
            click.echo("Recent email attempts (last 5):")
            for a in recent:
                click.echo(f"  [{a.status}] {a.purpose} -> {a.masked_destination} ({a.provider}, {a.mode})")

            if send_test:
                from ..email_service import send_email, OutboundEmail
                click.echo("")
                click.echo(f"Sending test email to {send_test}...")
                result = send_email(
                    OutboundEmail(to=send_test, subject="RealMindX health check", html="<p>This is a health check test message.</p>"),
                    purpose="admin_alert",
                    recipient_user_id=None,
                    template_name="health_check",
                )
                click.echo(f"  Result: {result.status} (provider={result.provider})")
                if result.status == "failed":
                    click.echo(f"  Error: {result.error_message}")

        elif channel == "sms":
            api_key = current_app.config.get("ARKESEL_API_KEY", "")
            sender_id = current_app.config.get("ARKESEL_SENDER_ID", "RealMindX")
            click.echo("SMS provider configuration (Arkesel):")
            click.echo(f"  API key: {'SET' if api_key else 'NOT SET'}")
            click.echo(f"  Sender ID: {sender_id}")

            recent = CommunicationAttempt.query.filter_by(
                channel="sms",
            ).order_by(CommunicationAttempt.requested_at.desc()).limit(5).all()
            click.echo("")
            click.echo("Recent SMS attempts (last 5):")
            for a in recent:
                click.echo(f"  [{a.status}] {a.purpose} -> {a.masked_destination} ({a.provider})")

            if send_test:
                from ..sms_service import send_sms
                click.echo("")
                click.echo(f"Sending test SMS to {send_test}...")
                result = send_sms(
                    send_test,
                    "RealMindX health check message",
                    purpose="admin_alert",
                    recipient_user_id=None,
                    template_name="health_check",
                )
                click.echo(f"  Result: {result.status} (provider={result.provider})")
                if result.status == "failed":
                    click.echo(f"  Error: {result.error_message}")

        elif channel == "whatsapp":
            access_token = current_app.config.get("WHATSAPP_ACCESS_TOKEN", "")
            phone_number_id = current_app.config.get("WHATSAPP_PHONE_NUMBER_ID", "")
            click.echo("WhatsApp provider configuration (Meta Cloud API):")
            click.echo(f"  Access token: {'SET' if access_token else 'NOT SET'}")
            click.echo(f"  Phone number ID: {'SET' if phone_number_id else 'NOT SET'}")

            recent = CommunicationAttempt.query.filter_by(
                channel="whatsapp",
            ).order_by(CommunicationAttempt.requested_at.desc()).limit(5).all()
            click.echo("")
            click.echo("Recent WhatsApp attempts (last 5):")
            for a in recent:
                click.echo(f"  [{a.status}] {a.purpose} -> {a.masked_destination} ({a.provider})")

            if send_test:
                from ..whatsapp_service import send_whatsapp_text
                click.echo("")
                click.echo(f"Sending test WhatsApp message to {send_test}...")
                result = send_whatsapp_text(
                    send_test,
                    "RealMindX health check message",
                    purpose="admin_alert",
                    recipient_user_id=None,
                    template_name="health_check",
                )
                click.echo(f"  Result: {result.status} (provider={result.provider})")
                if result.status == "failed":
                    click.echo(f"  Error: {result.error_message}")
        else:
            click.echo(f"Unknown channel: {channel}. Use email, sms, or whatsapp.")

    @app.cli.command("whatsapp-health")
    @click.option("--meta-check/--no-meta-check", default=False, help="Query Meta Graph API (read-only). Requires network access.")
    def whatsapp_health_command(meta_check):
        """Report WhatsApp Cloud API configuration and recent activity. Never sends messages or alters Meta config."""
        from .whatsapp_service import WHATSAPP_VERIFICATION_PHRASE
        from .models import WhatsAppWebhookEvent

        cfg = current_app.config
        click.echo("=== WhatsApp Health Check ===")
        click.echo("")

        click.echo("--- Required Environment Variables ---")
        for key in ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID",
                     "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_APP_ID",
                     "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]:
            val = cfg.get(key, "")
            click.echo(f"  {key}: {'SET' if val else 'MISSING'}")

        click.echo("")
        click.echo("--- Optional Environment Variables ---")
        for key in ["WHATSAPP_BUSINESS_PHONE_E164", "WHATSAPP_GRAPH_API_VERSION",
                     "WHATSAPP_OTP_TEMPLATE_NAME", "WHATSAPP_OTP_TEMPLATE_LANGUAGE"]:
            val = cfg.get(key, "")
            if val:
                click.echo(f"  {key}: {val}")
            else:
                click.echo(f"  {key}: MISSING")

        from .sms_service import normalise_phone
        business_phone = normalise_phone(cfg.get("WHATSAPP_BUSINESS_PHONE_E164", "")) or "+233257125229"
        support_phone = normalise_phone(cfg.get("WHATSAPP_SUPPORT_PHONE_E164", "")) or "+233201166122"
        click.echo(f"  WHATSAPP_BUSINESS_PHONE_E164: {business_phone}")
        click.echo(f"  WHATSAPP_SUPPORT_PHONE_E164: {support_phone}")
        click.echo(f"  WHATSAPP_SUPPORT_PHONE_DISPLAY: {cfg.get('WHATSAPP_SUPPORT_PHONE_DISPLAY', 'N/A')}")
        click.echo(f"  WHATSAPP_PHONE_VERIFICATION_ENABLED: {cfg.get('WHATSAPP_PHONE_VERIFICATION_ENABLED', False)}")
        click.echo(f"  WHATSAPP_PHONE_VERIFICATION_ALLOW_ALL: {cfg.get('WHATSAPP_PHONE_VERIFICATION_ALLOW_ALL', False)}")
        click.echo(f"  WHATSAPP_INBOUND_CHALLENGE_ENABLED: {cfg.get('WHATSAPP_INBOUND_CHALLENGE_ENABLED', True)}")
        click.echo(f"  WHATSAPP_CHALLENGE_PREFIX: {cfg.get('WHATSAPP_CHALLENGE_PREFIX', '(not set)')}")

        click.echo("")
        click.echo("--- Verification Phrase ---")
        click.echo(f"  Expected inbound phrase: {WHATSAPP_VERIFICATION_PHRASE}")
        prefix = cfg.get("WHATSAPP_CHALLENGE_PREFIX", "").strip()
        if prefix:
            click.echo(f"  Also accepted (prefix + optional code): {prefix} [CODE]")

        click.echo("")
        click.echo("--- Recent Webhook Events (last 20) ---")
        events = WhatsAppWebhookEvent.query.order_by(WhatsAppWebhookEvent.created_at.desc()).limit(20).all()
        if events:
            for ev in events:
                sender_masked = ev.sender[:6] + "****" + ev.sender[-2:] if ev.sender and len(ev.sender) > 8 else ev.sender
                click.echo(f"  [{ev.created_at}] {ev.status} from={sender_masked} msg_id={ev.message_id}")
                if ev.text_preview:
                    click.echo(f"    text: {ev.text_preview[:60]}")
        else:
            click.echo("  (no events recorded)")

        click.echo("")
        click.echo("--- Active Pending Challenges ---")
        now = datetime.now(timezone.utc)
        pending = ContactChangeToken.query.filter(
            ContactChangeToken.field == "phone",
            ContactChangeToken.delivery_channel == "whatsapp_inbound",
            ContactChangeToken.status == "pending",
            ContactChangeToken.expires_at >= now,
        ).order_by(ContactChangeToken.created_at.desc()).limit(10).all()
        if pending:
            for ch in pending:
                target_masked = ch.target_value[:6] + "****" + ch.target_value[-2:] if ch.target_value and len(ch.target_value) > 8 else ch.target_value
                click.echo(f"  id={ch.id} user={ch.user_id} target={target_masked} expires={ch.expires_at}")
        else:
            click.echo("  (none)")

        if meta_check:
            click.echo("")
            click.echo("--- Meta Graph API Check (read-only) ---")
            import json, urllib.request
            token = cfg.get("WHATSAPP_ACCESS_TOKEN", "")
            waba_id = cfg.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")
            pnid = cfg.get("WHATSAPP_PHONE_NUMBER_ID", "")
            api_ver = cfg.get("WHATSAPP_GRAPH_API_VERSION", "v23.0")

            def graph_get(path):
                url = f"https://graph.facebook.com/{api_ver}/{path}"
                try:
                    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                    with urllib.request.urlopen(req, timeout=20) as r:
                        return json.loads(r.read().decode()), r.status
                except Exception as e:
                    return {"error": str(e)}, 0

            if pnid:
                data, status = graph_get(f"{pnid}?fields=id,display_phone_number,code_verification_status,platform_type,webhook_configuration")
                click.echo(f"  Phone number status ({pnid[:8]}...):")
                if status == 200:
                    click.echo(f"    display_phone_number: {data.get('display_phone_number')}")
                    click.echo(f"    code_verification_status: {data.get('code_verification_status')}")
                    click.echo(f"    platform_type: {data.get('platform_type')}")
                    wc = data.get("webhook_configuration") or {}
                    click.echo(f"    webhook URL: {wc.get('application', 'N/A')}")
                else:
                    click.echo(f"    Error: {data.get('error', {}).get('message', data.get('error', 'unknown'))}")

            if waba_id:
                data, status = graph_get(f"{waba_id}/subscribed_apps")
                click.echo(f"  WABA subscription ({waba_id[:8]}...):")
                if status == 200:
                    apps = data.get("data") or []
                    click.echo(f"    Subscribed apps: {len(apps)}")
                    for entry in apps:
                        nested = entry.get("whatsapp_business_api_data") or {}
                        click.echo(f"      {nested.get('name', entry.get('id', '?'))} (id={nested.get('id', '?')})")
                else:
                    click.echo(f"    Error: {data.get('error', {}).get('message', data.get('error', 'unknown'))}")
        else:
            click.echo("")
            click.echo("  (use --meta-check to query Meta Graph API)")

        click.echo("")
        click.echo("--- Recommendations ---")
        token = cfg.get("WHATSAPP_ACCESS_TOKEN", "")
        pnid = cfg.get("WHATSAPP_PHONE_NUMBER_ID", "")
        app_secret = cfg.get("WHATSAPP_APP_SECRET", "")
        if not token:
            click.echo("  - Set WHATSAPP_ACCESS_TOKEN in .env")
        if not pnid:
            click.echo("  - Set WHATSAPP_PHONE_NUMBER_ID in .env")
        if not app_secret:
            click.echo("  - Set WHATSAPP_APP_SECRET in .env (webhook signature validation)")
        if not events:
            click.echo("  - No webhook events received. Check Meta WABA subscription and phone number registration.")
        click.echo("  - The webhook endpoint must be reachable at: https://realmindxgh.com/api/webhooks/whatsapp")
        click.echo("  - Verify GET challenge: https://realmindxgh.com/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test")

    @app.cli.command("send-stale-pending-digest")
    @click.option("--dry-run", is_flag=True, help="Show counts without sending email.")
    def stale_pending_digest_command(dry_run):
        """Send digest of stale pending teacher apps, book requests, and orders to admin inboxes."""
        from .pending_digest import send_stale_pending_digest

        result = send_stale_pending_digest(dry_run=dry_run)
        if result.get("dry_run"):
            click.echo(f"[dry-run] stale items: {result}")
        elif result.get("sent"):
            click.echo(f"Stale pending digest sent: {result}")
        else:
            click.echo(f"Digest not sent: {result}")
