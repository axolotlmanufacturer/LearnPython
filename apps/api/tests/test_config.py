"""Configuration that fails loudly rather than late."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_an_async_driver_is_accepted():
    settings = Settings(database_url="postgresql+asyncpg://user:pw@host/db")
    assert settings.database_url.startswith("postgresql+asyncpg://")


def test_a_synchronous_driver_url_is_rejected():
    # The spelling everything else uses, and the one most likely to be pasted
    # into a deployment. The engine is built lazily, so without this the process
    # would boot, pass a status-code health check, and 500 on every request.
    with pytest.raises(ValidationError, match="async driver"):
        Settings(database_url="postgresql://user:pw@host/db")


def test_the_session_cookie_is_secure_in_production():
    assert Settings(environment="production").cookie_secure is True
    assert Settings(environment="development").cookie_secure is False
