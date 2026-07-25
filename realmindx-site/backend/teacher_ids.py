"""Teacher identity ID generation.

Uses a counter table (TeacherIdCounter) for safe concurrent ID generation
on both SQLite and PostgreSQL.  Each year has its own application-ID sequence
so that RMX-APP-{YEAR}-{number} resets annually.  Teacher IDs use the same
year row but a separate counter so they are independent of application IDs.

These functions are implemented and tested but are not yet wired into the
signup or review flows — that will happen in a later phase.
"""

import re
from datetime import datetime, timezone

from .extensions import db
from .models import TeacherIdCounter

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


def _get_and_increment_teacher_seq(year):
    counter = _counter_for_year(year)
    return _next_seq(counter, "last_teacher_seq")


def generate_application_id(year_override=None):
    """Return the next application ID.

    Format: ``RMX-APP-{YYYY}-{000001..999999}``

    Safe under concurrent requests: the counter row is locked (PostgreSQL) or
    serialised (SQLite) so no two callers can receive the same ID.

    ``year_override`` is for testing the year-rollover path.  Callers that
    are not tests should omit it.
    """
    now = datetime.now(timezone.utc)
    year = year_override if year_override is not None else now.year
    seq = _get_and_increment_application_seq(year)
    return f"{APPLICATION_ID_PREFIX}-{year}-{seq:0{_PAD}d}"


def generate_teacher_id(year_override=None):
    """Return the next permanent teacher ID.

    Format: ``RMX-TCH-{000001..999999}``

    Uses the current year's counter row (creating it if it does not yet
    exist).  The teacher counter is independent of the application counter
    so the two sequences can advance at different rates.

    ``year_override`` is for testing the year-rollover path.  Callers that
    are not tests should omit it.
    """
    now = datetime.now(timezone.utc)
    year = year_override if year_override is not None else now.year
    seq = _get_and_increment_teacher_seq(year)
    return f"{TEACHER_ID_PREFIX}-{seq:0{_PAD}d}"


def is_valid_application_id(value):
    """Return True if *value* matches the expected application-ID format."""
    return bool(value and APPLICATION_ID_PATTERN.match(str(value)))


def is_valid_teacher_id(value):
    """Return True if *value* matches the expected teacher-ID format."""
    return bool(value and TEACHER_ID_PATTERN.match(str(value)))
