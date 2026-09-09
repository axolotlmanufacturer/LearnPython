"""Authentication: Argon2id password hashing and opaque server-side sessions.

docs/architecture.md §5 records why this is not built on an auth framework. In
short: nothing cryptographic is invented here — hashing is Argon2id via
`argon2-cffi`, tokens come from `secrets`, and the cookie carries the standard
flags — while server-side opaque sessions are simpler than the JWT flows those
frameworks default to, and give revocation for free.

Only the SHA-256 of a session token is stored. A database disclosure therefore
does not hand an attacker usable sessions.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.db import get_db
from app.models import AuthSession, User

_hasher = PasswordHasher()

MIN_PASSWORD_LENGTH = 10
TOKEN_BYTES = 32


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False
    return True


def needs_rehash(password_hash: str) -> bool:
    """True when the stored hash used weaker parameters than we now use."""
    try:
        return _hasher.check_needs_rehash(password_hash)
    except InvalidHashError:
        return True


def hash_token(token: str) -> str:
    """Session tokens are high-entropy random values, so a plain SHA-256 is the
    right tool: it needs to be fast and deterministic, and there is nothing to
    brute-force."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalise_email(email: str) -> str:
    return email.strip().lower()


def validate_password(password: str) -> None:
    """Length is the requirement that actually correlates with strength.

    Deliberately no composition rules: mandated symbol classes push people
    towards predictable substitutions without adding real entropy.
    """
    if len(password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Please choose a password of at least {MIN_PASSWORD_LENGTH} characters.",
        )
    if len(password) > 1024:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That password is too long.",
        )


async def purge_expired_sessions(db: AsyncSession, user_id: int) -> None:
    """Drop a user's expired session rows.

    Called from sign-in, which is already a write that commits. Doing this
    lazily during session *resolution* would not work: the common case is a
    request that then fails with 401, and the failure rolls the delete back.
    """
    await db.execute(
        delete(AuthSession).where(
            AuthSession.user_id == user_id, AuthSession.expires_at <= datetime.now(UTC)
        )
    )


async def create_session(db: AsyncSession, user: User, settings: Settings) -> str:
    """Create a session row and return the token to put in the cookie."""
    await purge_expired_sessions(db, user.id)
    token = secrets.token_urlsafe(TOKEN_BYTES)
    session = AuthSession(
        user_id=user.id,
        token_hash=hash_token(token),
        expires_at=datetime.now(UTC) + timedelta(days=settings.session_ttl_days),
    )
    db.add(session)
    await db.flush()
    return token


def set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        max_age=settings.session_ttl_days * 24 * 60 * 60,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )


async def revoke_session(db: AsyncSession, token: str) -> None:
    await db.execute(delete(AuthSession).where(AuthSession.token_hash == hash_token(token)))


async def resolve_user(db: AsyncSession, token: str | None) -> User | None:
    """Return the user for a session token, or None if there isn't a live one.

    Read-only by design; expired rows are removed by `purge_expired_sessions`.
    """
    if not token:
        return None

    result = await db.execute(
        select(AuthSession).where(
            AuthSession.token_hash == hash_token(token),
            AuthSession.expires_at > datetime.now(UTC),
        )
    )
    session = result.scalar_one_or_none()
    if session is None:
        return None

    return await db.get(User, session.user_id)


# ----------------------------------------------------------- dependencies


async def current_user_optional(
    request: Request,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User | None:
    return await resolve_user(db, request.cookies.get(settings.session_cookie_name))


async def current_user(user: User | None = Depends(current_user_optional)) -> User:
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Please sign in to continue.",
        )
    return user
