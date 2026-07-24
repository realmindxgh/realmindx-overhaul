"""
Normalize product taxonomy fields (subject, level, curriculum, publisher)
to their canonical display names using bookshopSearchAliases.json.

Dry-run mode (default): prints before/after for each changed row without writing.
Commit mode: pass --apply to persist changes.

Usage:
    & .venv\Scripts\python.exe scripts\normalize_product_taxonomy.py              # dry-run
    & .venv\Scripts\python.exe scripts\normalize_product_taxonomy.py --apply      # persist
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend import create_app
from backend.extensions import db
from backend.models import Product
from backend.bookshop_search import canonical_taxonomy_value

app = create_app()

TAXONOMY_FIELDS = [
    ("subject", "subject"),
    ("level", "level"),
    ("curriculum", "curriculum"),
    ("publisher", "publisher"),
]


def normalize(value, taxonomy):
    if not value:
        return value
    try:
        return canonical_taxonomy_value(taxonomy, value)
    except Exception:
        return value


def run(dry_run=True):
    dry_run_label = "DRY RUN" if dry_run else "APPLYING"
    print(f"[{dry_run_label}] Scanning products for taxonomy normalization...\n")

    with app.app_context():
        products = Product.query.all()
        changed = 0
        total = len(products)

        for product in products:
            for field, taxonomy in TAXONOMY_FIELDS:
                current = getattr(product, field, None)
                canonical = normalize(current, taxonomy)
                if canonical != current:
                    before = current or "(empty)"
                    after = canonical or "(empty)"
                    print(
                        f"  {product.id:>6}  {product.slug:<40s}  "
                        f"{field:<12s}  {before:<30s} -> {after}"
                    )
                    if not dry_run:
                        setattr(product, field, canonical)
                    changed += 1

        if changed == 0:
            print("  (no changes needed)")
        else:
            print(f"\n  Total rows touched: {changed} field(s) across {total} product(s)")

        if not dry_run and changed > 0:
            db.session.commit()
            print(f"  Committed {changed} normalization(s) to the database.")
        elif not dry_run and changed == 0:
            print("  Nothing to commit.")

    print(f"\n[{dry_run_label}] Done.")


if __name__ == "__main__":
    dry_run = "--apply" not in sys.argv
    run(dry_run=dry_run)
