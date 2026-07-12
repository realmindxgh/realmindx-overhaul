"""Versioned delivery portal terms loaded from the approved legal source text."""

import hashlib
import re
from datetime import datetime, timezone
from pathlib import Path

from .audit import audit
from .extensions import db
from .models import PlatformTermsAcceptance


LEGAL_DIR = Path(__file__).resolve().parent / "legal"
TERM_DEFINITIONS = {
    "delivery_company_terms": {
        "actor_type": "delivery_company_user",
        "version": "delivery_company_terms_v1_2026_07",
        "title": "RealMindX Delivery Company Platform Terms",
        "effective_date": "2026-07-12",
        "path": LEGAL_DIR / "delivery_company_terms.txt",
        "download_url": "/legal/RealMindX%20Delivery%20Company%20Platform%20Terms.docx",
        "login_wording": "By signing in to use the RealMindX Delivery Company Platform, you agree to the RealMindX Delivery Company Platform Terms.",
        "checkbox_wording": "I confirm that I have read and agree to the RealMindX Delivery Company Platform Terms, and that I am authorised to use this platform on behalf of my delivery company.",
    },
    "rider_terms": {
        "actor_type": "delivery_rider",
        "version": "rider_terms_v1_2026_07",
        "title": "RealMindX Rider Platform Terms",
        "effective_date": "2026-07-12",
        "path": LEGAL_DIR / "rider_terms.txt",
        "download_url": "/legal/RealMindX%20Rider%20Platform%20Terms.docx",
        "login_wording": "By signing in to use the RealMindX Rider Platform, you agree to the RealMindX Rider Platform Terms.",
        "checkbox_wording": "I confirm that I have read and agree to the RealMindX Rider Platform Terms, and I understand that I must protect customer information, handle packages carefully, and use OTP only for real delivery confirmation.",
    },
}


def _definition(terms_type):
    definition = TERM_DEFINITIONS.get(terms_type)
    if not definition:
        raise ValueError("Unknown platform terms type.")
    return definition


def terms_content(terms_type):
    definition = _definition(terms_type)
    content = definition["path"].read_text(encoding="utf-8").strip()
    return content, hashlib.sha256((content + "\n").encode("utf-8")).hexdigest()


def structured_sections(content):
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", content) if part.strip()]
    sections = []
    intro = []
    current = None
    for paragraph in paragraphs[3:]:
        if re.match(r"^\d+\.\s+", paragraph):
            current = {"heading": paragraph, "paragraphs": []}
            sections.append(current)
        elif current:
            current["paragraphs"].append(paragraph)
        else:
            intro.append(paragraph)
    return intro, sections


def current_acceptance(user_id, terms_type):
    definition = _definition(terms_type)
    _, content_hash = terms_content(terms_type)
    return PlatformTermsAcceptance.query.filter_by(
        user_id=user_id,
        terms_type=terms_type,
        terms_version=definition["version"],
        terms_hash=content_hash,
    ).order_by(PlatformTermsAcceptance.accepted_at.desc()).first()


def has_accepted_current_terms(user_id, terms_type):
    return current_acceptance(user_id, terms_type) is not None


def terms_payload(terms_type, user_id=None):
    definition = _definition(terms_type)
    content, content_hash = terms_content(terms_type)
    intro, sections = structured_sections(content)
    acceptance = current_acceptance(user_id, terms_type) if user_id else None
    return {
        "terms_type": terms_type,
        "version": definition["version"],
        "title": definition["title"],
        "effective_date": definition["effective_date"],
        "hash": content_hash,
        "content": content,
        "intro": intro,
        "sections": sections,
        "download_url": definition["download_url"],
        "login_wording": definition["login_wording"],
        "checkbox_wording": definition["checkbox_wording"],
        "accepted": acceptance is not None,
        "accepted_at": acceptance.accepted_at.isoformat() if acceptance else None,
    }


def accept_current_terms(user, profile, terms_type, submitted_version, submitted_hash, ip_address=None, user_agent=None):
    definition = _definition(terms_type)
    _, content_hash = terms_content(terms_type)
    if submitted_version != definition["version"] or submitted_hash != content_hash:
        raise ValueError("These terms have changed. Reload the current version before accepting.")
    acceptance = current_acceptance(user.id, terms_type)
    if acceptance:
        return acceptance
    now = datetime.now(timezone.utc)
    acceptance = PlatformTermsAcceptance(
        user_id=user.id,
        actor_type=definition["actor_type"],
        delivery_company_id=profile.company_id,
        rider_id=profile.id if terms_type == "rider_terms" else None,
        terms_type=terms_type,
        terms_version=definition["version"],
        terms_hash=content_hash,
        accepted_at=now,
        ip_address=ip_address,
        user_agent=(user_agent or "")[:500] or None,
    )
    db.session.add(acceptance)
    db.session.flush()
    audit("platform_terms_accepted", "platform_terms_acceptance", acceptance.id, {
        "actor_type": definition["actor_type"], "terms_type": terms_type,
        "version": definition["version"], "terms_hash": content_hash,
        "delivery_company_id": profile.company_id,
        "rider_id": profile.id if terms_type == "rider_terms" else None,
    })
    return acceptance


def acceptance_status(user_id, terms_type):
    definition = _definition(terms_type)
    acceptance = current_acceptance(user_id, terms_type)
    return {
        "accepted": acceptance is not None,
        "version": acceptance.terms_version if acceptance else None,
        "accepted_at": acceptance.accepted_at.isoformat() if acceptance else None,
        "current_version": definition["version"],
    }
