"""FastAPI application entrypoint.

This service handles auth, curriculum delivery, and progress persistence. It does
not, and must not, execute learner-submitted code — that runs in the learner's own
browser under WebAssembly (see docs/architecture.md §1).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text

from app.config import get_settings
from app.db import dispose_engine, get_session_factory
from app.routers import auth, curriculum, progress, quiz


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="LearnPython API",
        version=settings.version,
        lifespan=lifespan,
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    @app.get("/api/health", tags=["meta"])
    async def health() -> dict[str, str]:
        database = "unknown"
        try:
            factory = get_session_factory()
            async with factory() as session:
                await session.execute(text("SELECT 1"))
            database = "connected"
        except Exception as exc:  # pragma: no cover - depends on local environment
            database = f"unavailable ({type(exc).__name__})"
        return {
            "status": "ok",
            "service": settings.app_name,
            "version": settings.version,
            "database": database,
        }

    app.include_router(auth.router)
    app.include_router(curriculum.router)
    app.include_router(progress.router)
    app.include_router(quiz.router)

    return app


app = create_app()
