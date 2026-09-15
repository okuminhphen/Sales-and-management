from decimal import Decimal

from fastapi.testclient import TestClient

from app.domain.models import Product
from app.main import create_app
from tests.fakes import FakeChatModel, FakeProductRepository


def test_health_and_chat_contracts() -> None:
    products = [Product(1, "Pijama", "Mềm", Decimal("120000"), ["a.jpg"], "Đồ ngủ")]
    app = create_app(
        repository=FakeProductRepository(products),
        chat_model=FakeChatModel(),
    )

    with TestClient(app) as client:
        health = client.get("/health/live", headers={"X-Request-ID": "ai-contract-123"})
        assert health.json() == {"status": "ok"}
        assert health.headers["x-request-id"] == "ai-contract-123"
        response = client.post("/chat", json={"message": "Có đồ ngủ không?"})

    assert response.status_code == 200
    assert response.json()["reply"] == "Echo: Có đồ ngủ không?"
    assert response.json()["products"][0]["product_id"] == 1
