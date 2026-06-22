from functools import lru_cache
from hashlib import sha256
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

try:
    import reportlab
except ImportError:
    reportlab = None


OG_SIZE = (1200, 630)
OG_TEMPLATE_VERSION = "2026-06-22-1"
NAVY = "#062B69"
NAVY_DARK = "#031C48"
GOLD = "#F9A900"
OFF_WHITE = "#F7F9FC"
TEXT_MUTED = "#52647A"
CARD_BORDER = "#DDE5F0"
OG_BG_TOP = "#071B3D"
OG_BG_BOTTOM = "#0B3678"
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
        OG_TEMPLATE_VERSION,
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


def _hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[index:index + 2], 16) for index in (0, 2, 4))


def _vertical_gradient(size, start, end):
    image = Image.new("RGB", size, start)
    draw = ImageDraw.Draw(image)
    start_rgb = _hex_rgb(start)
    end_rgb = _hex_rgb(end)
    height = max(size[1] - 1, 1)
    for y in range(size[1]):
        ratio = y / height
        color = tuple(
            round(start_rgb[channel] + (end_rgb[channel] - start_rgb[channel]) * ratio)
            for channel in range(3)
        )
        draw.line((0, y, size[0], y), fill=color)
    return image


def _rounded_shadow(canvas, box, radius, fill, *, shadow=(0, 0, 0, 72), blur=24, offset=(0, 14)):
    x1, y1, x2, y2 = box
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow_layer)
    shadow_draw.rounded_rectangle(
        (x1 + offset[0], y1 + offset[1], x2 + offset[0], y2 + offset[1]),
        radius=radius,
        fill=shadow,
    )
    canvas.alpha_composite(shadow_layer.filter(ImageFilter.GaussianBlur(blur)))
    ImageDraw.Draw(canvas).rounded_rectangle(box, radius=radius, fill=fill)


@lru_cache(maxsize=256)
def _render_book_og_cached(title, price, cover_path, cover_stamp, branding_path, branding_stamp):
    del cover_stamp, branding_stamp
    canvas = _vertical_gradient(OG_SIZE, OG_BG_TOP, OG_BG_BOTTOM).convert("RGBA")
    draw = ImageDraw.Draw(canvas)

    draw.rectangle((0, 0, OG_SIZE[0], 12), fill=GOLD)
    draw.ellipse((875, -290, 1430, 265), outline=(255, 255, 255, 24), width=3)
    draw.ellipse((925, -220, 1370, 225), outline=(249, 169, 0, 52), width=2)
    draw.polygon(((1040, 630), (1200, 470), (1200, 630)), fill=(249, 169, 0, 36))

    brand = _open_image(branding_path)
    _rounded_shadow(
        canvas,
        (62, 48, 150, 136),
        22,
        (255, 255, 255, 255),
        shadow=(0, 0, 0, 42),
        blur=16,
        offset=(0, 8),
    )
    if brand is not None:
        fitted_brand = _fit_image(brand, (74, 74), padding=3, background=(255, 255, 255, 0))
        canvas.alpha_composite(fitted_brand, (69, 55))

    brand_font = _font(23, bold=True)
    brand_sub_font = _font(15, bold=True)
    label_font = _font(18, bold=True)
    title_size = 58 if len(title or "") <= 40 else 50 if len(title or "") <= 68 else 44
    title_font = _font(title_size, bold=True)
    price_label_font = _font(17, bold=True)
    price_font = _font(38, bold=True)
    body_font = _font(19)
    url_font = _font(19, bold=True)

    draw.text((170, 64), "REALMINDX", font=brand_font, fill="white")
    draw.text((170, 96), "BOOKSHOP", font=brand_sub_font, fill=GOLD)
    draw.rounded_rectangle((62, 174, 250, 210), radius=18, fill=GOLD)
    draw.text((82, 181), "FEATURED TITLE", font=label_font, fill=NAVY_DARK)

    title_lines = _wrap_text(draw, title, title_font, 650, max_lines=3)
    title_y = 232
    line_height = title_size + 10
    for line in title_lines:
        draw.text((62, title_y), line, font=title_font, fill="white")
        title_y += line_height

    price_y = max(445, title_y + 18)
    draw.text((62, price_y), "PRICE", font=price_label_font, fill=(193, 209, 235))
    price_text = f"GH₵ {float(price or 0):,.2f}"
    price_bbox = draw.textbbox((0, 0), price_text, font=price_font)
    price_width = price_bbox[2] - price_bbox[0]
    draw.rounded_rectangle((62, price_y + 28, 98 + price_width, price_y + 82), radius=14, fill=GOLD)
    draw.text((80, price_y + 34), price_text, font=price_font, fill=NAVY_DARK)

    draw.text(
        (62, 578),
        "Educational books • Fast delivery across Ghana",
        font=body_font,
        fill=(220, 230, 245),
    )

    _rounded_shadow(
        canvas,
        (792, 56, 1140, 574),
        30,
        (255, 255, 255, 255),
        shadow=(0, 0, 0, 100),
        blur=28,
        offset=(0, 18),
    )
    draw.rounded_rectangle((812, 76, 1120, 554), radius=22, outline=CARD_BORDER, width=2)
    cover = _open_image(cover_path)
    if cover is None:
        cover = brand
    if cover is not None:
        fitted_cover = _fit_image(cover, (280, 444), padding=4, background=(255, 255, 255, 255))
        canvas.alpha_composite(fitted_cover, (826, 93))

    footer_url = "bookshop.realmindxgh.com"
    footer_width = draw.textbbox((0, 0), footer_url, font=url_font)[2]
    draw.text((1140 - footer_width, 592), footer_url, font=url_font, fill="white")

    output = BytesIO()
    canvas.convert("RGB").save(output, format="PNG", optimize=True)
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
