import httpx
import pytest
from httpx import ASGITransport

from app.main import create_app


@pytest.fixture
def app():
    return create_app()


async def test_health_reports_service_metadata(app):
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "learnpython-api"
    assert "database" in body
