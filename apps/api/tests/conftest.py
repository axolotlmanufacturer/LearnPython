"""Test fixtures.

Tests run against a real PostgreSQL database, not SQLite. The schema uses JSONB
and Postgres-specific index behaviour, and a test suite that exercises a
different engine than production is testing something other than the product.

Each test gets a freshly created and dropped schema, which is fast enough at this
size and removes any ordering dependence between tests.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings, get_settings
from app.db import get_db
from app.main import create_app
from app.models import Base


def pytest_sessionstart(session: pytest.Session) -> None:
    """In CI, refuse to run without the libraries Track B's content needs.

    Locally, the Track B verification tests skip with an install hint when
    pandas, scipy or matplotlib are missing — reasonable on a laptop. In CI the
    same skip would be a green build that verified nothing, which is worse than a
    red one. So there, a missing library is a failure.
    """
    if not os.environ.get("CI"):
        return
    import importlib.util

    missing = [
        name
        for name in ("numpy", "pandas", "scipy", "matplotlib")
        if importlib.util.find_spec(name) is None
    ]
    if missing:
        pytest.exit(
            f"CI is missing {', '.join(missing)}: Track B's content would go unverified. "
            f'Install the API with pip install -e ".[dev,content]".',
            returncode=1,
        )


TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get(
        "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/learnpython_test"
    ),
)


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(database_url=TEST_DATABASE_URL, environment="test")


@pytest.fixture
async def engine():
    engine = create_async_engine(TEST_DATABASE_URL, poolclass=None)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)
    yield engine
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest.fixture
async def session_factory(engine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False, autoflush=False)


@pytest.fixture
async def db(session_factory) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session
        await session.commit()


@pytest.fixture
async def client(session_factory, settings) -> AsyncIterator[httpx.AsyncClient]:
    app = create_app()

    async def override_db() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_settings] = lambda: settings

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client


@pytest.fixture
def credentials() -> dict[str, str]:
    return {"email": "Learner@Example.com", "password": "correct-horse-battery"}


@pytest.fixture
async def signed_in(client: httpx.AsyncClient, credentials: dict[str, str]) -> dict[str, str]:
    response = await client.post("/api/auth/register", json=credentials)
    assert response.status_code == 201, response.text
    return credentials
