from datetime import UTC, datetime, timedelta

import httpx
import pytest
from sqlalchemy import select

from app.auth import hash_token
from app.models import AuthSession, User


async def test_register_creates_an_account_and_signs_the_learner_in(client, credentials):
    response = await client.post("/api/auth/register", json=credentials)

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "learner@example.com"  # normalised
    assert "password_hash" not in body
    assert client.cookies.get("lp_session")


async def test_register_rejects_a_duplicate_address_case_insensitively(client, credentials):
    await client.post("/api/auth/register", json=credentials)
    again = await client.post(
        "/api/auth/register", json={**credentials, "email": "LEARNER@example.com"}
    )

    assert again.status_code == 409


async def test_register_requires_a_password_of_reasonable_length(client, credentials):
    response = await client.post("/api/auth/register", json={**credentials, "password": "short"})

    assert response.status_code == 422
    assert "10 characters" in response.json()["detail"]


async def test_password_is_never_stored_in_plain_text(client, db, credentials):
    await client.post("/api/auth/register", json=credentials)

    user = (await db.execute(select(User))).scalar_one()
    assert credentials["password"] not in user.password_hash
    assert user.password_hash.startswith("$argon2")


async def test_session_token_is_stored_only_as_a_hash(client, db, credentials):
    await client.post("/api/auth/register", json=credentials)
    token = client.cookies.get("lp_session")

    session = (await db.execute(select(AuthSession))).scalar_one()
    assert session.token_hash != token
    assert session.token_hash == hash_token(token)


async def test_session_cookie_is_http_only_and_same_site(client, credentials):
    response = await client.post("/api/auth/register", json=credentials)

    cookie = response.headers["set-cookie"]
    assert "HttpOnly" in cookie
    assert "samesite=lax" in cookie.lower()


async def test_login_succeeds_with_the_right_password(client, signed_in):
    await client.post("/api/auth/logout")

    response = await client.post("/api/auth/login", json=signed_in)

    assert response.status_code == 200
    assert response.json()["email"] == "learner@example.com"


@pytest.mark.parametrize(
    "override",
    [
        {"password": "definitely-not-it"},
        {"email": "nobody@example.com"},
    ],
)
async def test_login_gives_the_same_answer_for_a_wrong_password_and_an_unknown_account(
    client, credentials, override
):
    await client.post("/api/auth/register", json=credentials)

    response = await client.post("/api/auth/login", json={**credentials, **override})

    assert response.status_code == 401
    # Identical wording either way: a different message would tell an attacker
    # which addresses are registered.
    assert response.json()["detail"] == "That email address and password do not match an account."


async def test_me_requires_a_session(client):
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_me_returns_the_signed_in_learner(client, signed_in):
    response = await client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == "learner@example.com"


async def test_logout_revokes_the_session_server_side(client, db, signed_in):
    token = client.cookies.get("lp_session")

    await client.post("/api/auth/logout")

    remaining = (await db.execute(select(AuthSession))).scalars().all()
    assert remaining == []

    # Even replaying the original cookie fails: revocation is a row delete, not
    # a client-side gesture.
    client.cookies.set("lp_session", token)
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_an_expired_session_is_rejected(client, db, signed_in):
    session = (await db.execute(select(AuthSession))).scalar_one()
    session.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()

    assert (await client.get("/api/auth/me")).status_code == 401


async def test_expired_sessions_are_cleared_out_on_the_next_sign_in(client, db, signed_in):
    # Cleanup happens on a write path. Doing it while *resolving* a session
    # would not stick: that request usually ends in a 401, and the failure rolls
    # the delete back with it.
    expired = (await db.execute(select(AuthSession))).scalar_one()
    expired.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    await db.commit()

    await client.post("/api/auth/login", json=signed_in)

    remaining = (await db.execute(select(AuthSession))).scalars().all()
    assert len(remaining) == 1
    assert remaining[0].id != expired.id


async def test_an_unknown_token_is_rejected(client, signed_in):
    client.cookies.set("lp_session", "not-a-real-token")

    assert (await client.get("/api/auth/me")).status_code == 401


async def test_logging_in_twice_leaves_both_sessions_valid(client, db, signed_in):
    # Signing in on a second device must not sign the learner out on the first.
    async with httpx.AsyncClient(
        transport=client._transport, base_url="http://test"
    ) as second_device:
        await second_device.post("/api/auth/login", json=signed_in)
        assert (await second_device.get("/api/auth/me")).status_code == 200

    assert (await client.get("/api/auth/me")).status_code == 200
    assert len((await db.execute(select(AuthSession))).scalars().all()) == 2
