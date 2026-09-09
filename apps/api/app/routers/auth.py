"""Registration, sign-in, sign-out, and the current user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import (
    clear_session_cookie,
    create_session,
    current_user,
    hash_password,
    needs_rehash,
    normalise_email,
    revoke_session,
    set_session_cookie,
    validate_password,
    verify_password,
)
from app.config import Settings, get_settings
from app.db import get_db
from app.models import User
from app.schemas import LoginRequest, RegisterRequest, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Argon2 verification is deliberately slow, which is what makes it useful. It
# also means a "no such account" reply that skips verification returns visibly
# faster than a wrong-password reply, letting an attacker enumerate registered
# addresses by timing. Verifying against a throwaway hash keeps the two paths
# comparable.
_DUMMY_HASH = hash_password("timing-equalisation-placeholder")


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    email = normalise_email(body.email)
    validate_password(body.password)

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for that email address.",
        )

    user = User(
        email=email,
        password_hash=hash_password(body.password),
        display_name=(body.display_name or "").strip() or None,
    )
    db.add(user)
    await db.flush()

    token = await create_session(db, user, settings)
    set_session_cookie(response, token, settings)
    return user


@router.post("/login", response_model=UserOut)
async def login(
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    email = normalise_email(body.email)
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        verify_password(_DUMMY_HASH, body.password)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That email address and password do not match an account.",
        )

    if not verify_password(user.password_hash, body.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="That email address and password do not match an account.",
        )

    # Opportunistically upgrade a hash written under weaker parameters.
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(body.password)

    token = await create_session(db, user, settings)
    set_session_cookie(response, token, settings)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Response:
    token = request.cookies.get(settings.session_cookie_name)
    if token:
        await revoke_session(db, token)
    clear_session_cookie(response, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user)) -> User:
    return user
