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
OG_TEMPLATE_VERSION = "2026-06-23-1"
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
            while remainder and draw.textbbox((0, 0), f"{remainder}...", font=font)[2] > max_width:
                remainder = remainder[:-1].rstrip()
            lines.append(f"{remainder}..." if words else remainder)
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
    relative = Path("static/assets/branding/bookshop-circular-mark.png")
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
    canvas = Image.new("RGBA", OG_SIZE, (252, 253, 255, 255))
    draw = ImageDraw.Draw(canvas)

    draw.rectangle((0, 0, OG_SIZE[0], 92), fill=NAVY)
    draw.rectangle((0, 618, OG_SIZE[0], 630), fill=GOLD)
    brand = _open_image(branding_path)
    if brand is not None:
        fitted_brand = _fit_image(brand, (76, 76), background=(255, 255, 255, 0))
        canvas.alpha_composite(fitted_brand, (32, 8))

    brand_font = _font(28, bold=True)
    label_font = _font(20, bold=True)
    title_size = 56 if len(title or "") <= 38 else 49 if len(title or "") <= 66 else 42
    title_font = _font(title_size, bold=True)
    price_font = _font(34, bold=True)
    body_font = _font(20)
    url_font = _font(18, bold=True)

    draw.text((126, 28), "RealMindX Bookshop", font=brand_font, fill="white")
    draw.rounded_rectangle((74, 145, 258, 190), radius=14, fill=GOLD)
    draw.text((95, 155), "Now in Store", font=label_font, fill=NAVY)

    title_lines = _wrap_text(draw, title, title_font, 655, max_lines=3)
    title_y = 218
    line_height = title_size + 8
    for line in title_lines:
        draw.text((74, title_y), line, font=title_font, fill=NAVY)
        title_y += line_height

    accent_y = min(title_y + 6, 414)
    draw.rounded_rectangle((74, accent_y, 164, accent_y + 4), radius=2, fill=GOLD)
    tagline_y = accent_y + 28
    draw.text((74, tagline_y), "Quality books for serious learning.", font=body_font, fill=TEXT_MUTED)

    price_y = min(max(tagline_y + 52, 452), 484)
    price_text = f"GHS {float(price or 0):,.2f}"
    price_bbox = draw.textbbox((0, 0), price_text, font=price_font)
    price_width = price_bbox[2] - price_bbox[0]
    pill_right = 172 + price_width
    draw.rounded_rectangle((74, price_y, pill_right, price_y + 64), radius=32, fill=NAVY)
    draw.ellipse((86, price_y + 10, 130, price_y + 54), fill=GOLD)
    draw.polygon(
        (
            (98, price_y + 31),
            (111, price_y + 18),
            (124, price_y + 18),
            (124, price_y + 31),
            (111, price_y + 44),
        ),
        fill="white",
    )
    draw.ellipse((116, price_y + 22, 121, price_y + 27), fill=GOLD)
    draw.text((144, price_y + 13), price_text, font=price_font, fill="white")

    _rounded_shadow(
        canvas,
        (790, 116, 1138, 578),
        24,
        (255, 255, 255, 255),
        shadow=(27, 54, 91, 48),
        blur=24,
        offset=(0, 12),
    )
    draw.rounded_rectangle((808, 134, 1120, 560), radius=18, outline=(230, 235, 243), width=2)
    cover = _open_image(cover_path)
    if cover is None:
        cover = brand
    if cover is not None:
        fitted_cover = _fit_image(cover, (282, 396), padding=4, background=(255, 255, 255, 255))
        canvas.alpha_composite(fitted_cover, (823, 149))

    globe_x, globe_y = 76, 570
    draw.ellipse((globe_x, globe_y, globe_x + 27, globe_y + 27), outline=NAVY, width=2)
    draw.arc((globe_x + 7, globe_y, globe_x + 20, globe_y + 27), 90, 270, fill=NAVY, width=2)
    draw.arc((globe_x + 7, globe_y, globe_x + 20, globe_y + 27), 270, 90, fill=NAVY, width=2)
    draw.line((globe_x + 2, globe_y + 13, globe_x + 25, globe_y + 13), fill=NAVY, width=2)
    draw.text((116, 572), "bookshop.realmindxgh.com", font=url_font, fill=NAVY)

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
