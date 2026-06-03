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
            