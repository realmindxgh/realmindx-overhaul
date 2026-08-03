"""Teacher identity ID generation.

Uses a counter table (TeacherIdCounter) for safe concurrent ID generation
on both SQLite and PostgreSQL.  Each year has its own application-ID sequence
so that RMX-APP-{YEAR}-{number} resets annually.

Teacher IDs use a dedicated global counter (TeacherIdGlobalCounter) that holds
a single row with a permanently incrementing sequence.  Because the approved
Teacher ID format (RMX-TCH-NNNNNN) contains no year, the numeric portion must
remain unique across all years and must never reset.
"""

import re
from datetime import datetime, timezone

from .extensions import db
from .models import TeacherIdCounter, TeacherIdGlobalCounter

APPLICATION_ID_PREFIX = "RMX-APP"
TEACHER_ID_PREFIX = "RMX-TCH"

APPLICATION_ID_PATTERN = re.compile(r"^RMX-APP-\d{4}-\d{6}$")
TEACHER_ID_PATTERN = re.compile(r"^RMX-TCH-\d{6}$")

_PAD = 6


def _counter_for_year(year):
    """Return the TeacherIdCounter row for *year*, creating it if missing.

    Uses ``with_for_update`` so that on PostgreSQL the row is locked for the
    remainder of the transaction, preventing two concurrent callers from
    reading the same sequence value.  On SQLite ``FOR UPDATE`` is silently
    ignored, but SQLite serialises all writes anyway, so it is safe.
    """
    counter = TeacherIdCounter.query.filter_by(year=year).with_for_update().first()
    if not counter:
        counter = TeacherIdCounter(year=year, last_application_seq=0, last_teacher_seq=0)
        db.session.add(counter)
        db.session.flush()
    return counter


def _next_seq(counter, attr):
    """Atomically increment *attr* on *counter* and return the new value."""
    setattr(counter, attr, getattr(counter, attr) + 1)
    db.session.flush()
    return getattr(counter, attr)


def _get_and_increment_application_seq(year):
    counter = _counter_for_year(year)
    return _next_seq(counter, "last_application_seq")


def _get_global_teacher_counter():
    """Return the single TeacherIdGlobalCounter row (``id = 1``), creating it if missing.

    The table uses ``id = 1`` as a fixed primary key so the database
    constraint itself guarantees at most one row.  Uses ``with_for_update``
    so that PostgreSQL locks the row for the remainder of the transaction,
    preventing two concurrent callers from reading the same sequence value.
    """
    counter = TeacherIdGlobalCounter.query.with_for_update().filter_by(id=1).first()
    if not counter:
        counter = TeacherIdGlobalCounter(id=1, last_teacher_seq=0)
        db.session.add(counter)
        db.session.flush()
    return counter


def generate_application_id():
    """Return the next application ID.

    Format: ``RMX-APP-{YYYY}-{000001..999999}``

    Safe under concurrent requests: the counter row is locked (PostgreSQL) or
    serialised (SQLite) so no two callers can receive the same ID.
    """
    now = datetime.now(timezone.utc)
    seq = _get_and_increment_application_seq(now.year)
    return f"{APPLICATION_ID_PREFIX}-{now.year}-{seq:0{_PAD}d}"


def ensure_application_id(user):
    """Return a valid application ID for a teacher account.

    Existing valid IDs are permanent and are never changed. Missing or
    malformed legacy values are replaced from the same concurrency-safe
    sequence used at registration. The caller owns the surrounding
    transaction and must commit it.
    """
    if is_valid_application_id(getattr(user, "application_id", None)):
        return user.application_id
    user.application_id = generate_application_id()
    db.session.flush()
    return user.application_id


def generate_teacher_id():
    """Return the next permanent teacher ID.

    Format: ``RMX-TCH-{000001..999999}``

    Uses a dedicated global counter (TeacherIdGlobalCounter) so the sequence
    never resets across years.  Safe under concurrent requests.
    """
    counter = _get_global_teacher_counter()
    counter.last_teacher_seq += 1
    db.session.flush()
    return f"{TEACHER_ID_PREFIX}-{counter.last_teacher_seq:0{_PAD}d}"


def is_valid_application_id(value):
    """Return True if *value* matches the expected application-ID format."""
    return bool(value and APPLICATION_ID_PATTERN.match(str(value)))


def is_valid_teacher_id(value):
    """Return True if *value* matches the expected teacher-ID format."""
    return bool(value and TEACHER_ID_PATTERN.match(str(value)))
