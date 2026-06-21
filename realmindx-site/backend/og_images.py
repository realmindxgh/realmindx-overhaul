from functools import lru_cache
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

try:
    import reportlab
except ImportError:
    reportlab = None


OG_SIZE = (1200, 630)
NAVY = "#062B69"
NAVY_DARK = "#031C48"
GOLD = "#F9A900"
OFF_WHITE = "#F7F9FC"
TEXT_MUTED = "#52647A"
REPORTLAB_FONT_DIR = Path(reportlab.__file__).resolve().parent / "fonts" if reportlab else None


def _font_path(*candidates):
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate)
        if path.is_file():
            return str(path)
    return None


FONT_BOLD = _font_path(
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
    REPORTLAB_FONT_DIR / "VeraBd.ttf" if REPORTLAB_FONT_DIR else "",
)
FONT_REGULAR = _font_path(
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    REPORTLAB_FONT_DIR / "Vera.ttf" if REPORTLAB_FONT_DIR else "",
)


def _font(size, *, bold=False):
    path = FONT_BOLD if bold else FONT_REGULAR
    if path:
        return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def _open_image(path):
    if not path:
        return None
    try:
        with Image.open(path) as image:
            return ImageOps.exif_transpose(image).convert("RGBA")
    except (OSError, ValueError):
        return None


def _fit_image(image, size, background=(255, 255, 255, 255), padding=0):
    target = Image.new("RGBA", size, background)
    inner = (max(size[0] - padding * 2, 1), max(size[1] - padding * 2, 1))
    fitted = ImageOps.contain(image, inner, Image.Resampling.LANCZOS)
    target.alpha_composite(
        fitted,
        ((size[0] - fitted.width) // 2, (size[1] - fitted.height) // 2),
    )
    return target


def _wrap_text(draw, text, font, max_width, max_lines=3):
    words = str(text or "").split()
    if not words:
        return [""]
    lines = []
    current = words.pop(0)
    while words:
        candidate = f"{current} {words[0]}"
        if draw.textbbox((0, 0), candidate, font=font)[2] <= max_width:
            current = candidate
            words.pop(0)
            continue
        lines.append(current)
        current = words.pop(0)
        if len(lines) == max_lines - 1:
            remainder = " ".join([current, *words])
            while remainder and draw.textbbox((0, 0), f"{remainder}…", font=font)[2] > max_width:
                remainder = remainder[:-1].rstrip()
            lines.append(f"{remainder}…" if words else remainder)
            return lines
    lines.append(current)
    return lines[:max_lines]


def _file_stamp(path):
    if not path:
        return ""
    try:
        file_path = Path(path)
        stat = file_path.stat()
        return f"{file_path}:{stat.st_mtime_ns}:{stat.st_size}"
    except OSError:
        return str(path)


def book_og_version(product):
    updated_at = product.updated_at.isoformat() if product.updated_at else ""
    raw = "|".join([
        str(product.id),
        product.name or "",
        str(product.price or ""),
        updated_at,
        _file_stamp(product.image_file.storage_path if product.image_file else ""),
    ])
    return sha256(raw.encode("utf-8")).hexdigest()[:12]


def book_og_public_url(product, base_url="https://bookshop.realmindxgh.com"):
    return f"{base_url.rstrip('/')}/api/og/books/{product.id}.png?v={book_og_version(product)}"


def resolve_bookshop_branding_path(config):
    relative = Path("static/assets/branding/bookshop-og-mark.png")
    candidates = [
        Path(config.get("FRONTEND_DIST_DIR", "")) / relative,
        Path(__file__).resolve().parents[2] / "public" / relative,
    ]
    return next((path for path in candidates if path.exists()), None)


@lru_cache(maxsize=256)
def _render_book_og_cached(title, price, cover_path, cover_stamp, branding_path, branding_stamp):
    del cover_stamp, branding_stamp
    canvas = Image.new("RGB", OG_SIZE, OFF_WHITE)
    draw = ImageDraw.Draw(canvas)

    draw.rectangle((0, 0, 28, OG_SIZE[1]), fill=GOLD)
    draw.rounded_rectangle((52, 42, 472, 588), radius=28, fill="#E7EDF5")
    draw.rounded_rectangle((66, 54, 458, 576), radius=22, fill="white")

    cover = _open_image(cover_path)
    if cover is None:
        cover = _open_image(branding_path)
    if cover is not None:
        fitted_cover = _fit_image(cover, (340, 470), padding=12)
        canvas.paste(fitted_cover.convert("RGB"), (92, 80))

    brand = _open_image(branding_path)
    if brand is not None:
        fitted_brand = _fit_image(brand, (112, 112), padding=4)
        canvas.paste(fitted_brand.convert("RGB"), (1032, 38))

    label_font = _font(23, bold=True)
    title_font = _font(54, bold=True)
    price_label_font = _font(22, bold=True)
    price_font = _font(43, bold=True)
    body_font = _font(21)
    url_font = _font(20, bold=True)

    draw.text((526, 62), "REALMINDX BOOKSHOP", font=label_font, fill=NAVY)
    draw.rounded_rectangle((526, 100, 804, 108), radius=4, fill=GOLD)

    title_lines = _wrap_text(draw, title, title_font, 605, max_lines=4)
    title_y = 146
    line_height = 64
    for line in title_lines:
        draw.text((526, title_y), line, font=title_font, fill=NAVY_DARK)
        title_y += line_height

    price_y = max(430, title_y + 22)
    draw.text((526, price_y), "PRICE", font=price_label_font, fill=TEXT_MUTED)
    draw.text((526, price_y + 32), f"GH₵ {float(price or 0):,.2f}", font=price_font, fill=NAVY)

    draw.text(
        (526, 558),
        "Educational books and learning materials across Ghana",
        font=body_font,
        fill=TEXT_MUTED,
    )
    draw.text((930, 590), "bookshop.realmindxgh.com", font=url_font, fill=NAVY)

    output = BytesIO()
    canvas.save(output, format="PNG", optimize=True)
    return output.getvalue()


def render_book_og(product, config):
    cover_path = product.image_file.storage_path if product.image_file else ""
    branding_path = resolve_bookshop_branding_path(config)
    return _render_book_og_cached(
        product.name or "RealMindX Bookshop",
        str(product.price or 0),
        str(cover_path or ""),
        _file_stamp(cover_path),
        str(branding_path or ""),
        _file_stamp(branding_path),
    )
