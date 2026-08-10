import re
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse


ALLOWED_TAGS = {"p", "div", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "h2", "h3", "h4"}
VOID_TAGS = {"br"}
ALIGNMENT_RE = re.compile(r"^text-align:\s*(left|center|right|justify);?$", re.IGNORECASE)


def _safe_href(value):
    value = (value or "").strip()
    if value.startswith("//"):
        return ""
    if value.startswith(("/", "#")):
        return value
    return value if urlparse(value).scheme.lower() in {"http", "https", "mailto", "tel"} else ""


class _RichTextSanitizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.output = []
        self.open_tags = []
        self.suppressed_depth = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if self.suppressed_depth or tag in {"script", "style", "template", "iframe", "object"}:
            self.suppressed_depth += 1
            return
        if tag not in ALLOWED_TAGS:
            return
        clean_attrs = []
        values = dict(attrs)
        style = values.get("style", "")
        if ALIGNMENT_RE.fullmatch(style.strip()):
            clean_attrs.append(("style", style.strip()))
        if tag == "a":
            href = _safe_href(values.get("href"))
            if href:
                clean_attrs.extend((("href", href), ("target", "_blank"), ("rel", "noopener noreferrer")))
        rendered_attrs = "".join(f' {name}="{escape(value, quote=True)}"' for name, value in clean_attrs)
        self.output.append(f"<{tag}{rendered_attrs}>")
        if tag not in VOID_TAGS:
            self.open_tags.append(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if self.suppressed_depth:
            self.suppressed_depth -= 1
            return
        if tag not in ALLOWED_TAGS or tag in VOID_TAGS or tag not in self.open_tags:
            return
        while self.open_tags:
            current = self.open_tags.pop()
            self.output.append(f"</{current}>")
            if current == tag:
                break

    def handle_data(self, data):
        if not self.suppressed_depth:
            self.output.append(escape(data))

    def close(self):
        super().close()
        while self.open_tags:
            self.output.append(f"</{self.open_tags.pop()}>")


def contains_rich_html(value):
    return bool(re.search(r"</?(?:p|div|br|strong|b|em|i|u|s|a|ul|ol|li|blockquote|h[2-4])\b", value or "", re.IGNORECASE))


def sanitize_rich_html(value):
    sanitizer = _RichTextSanitizer()
    sanitizer.feed(value or "")
    sanitizer.close()
    return "".join(sanitizer.output)
