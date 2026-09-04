from decimal import Decimal

import pytest

from app.application.recommendations import RecommendationService
from app.domain.models import Product, UserSignal
from tests.fakes import FakeProductRepository


def product(product_id: int, name: str, category: str) -> Product:
    return Product(product_id, name, "cotton mềm", Decimal("100000"), [], category)


@pytest.mark.asyncio
async def test_similar_products_prioritizes_content() -> None:
    products = [
        product(1, "Pijama xanh", "Pijama"),
        product(2, "Pijama hồng", "Pijama"),
        product(3, "Váy công sở", "Váy"),
    ]
    service = RecommendationService(FakeProductRepository(products))

    result = await service.similar_products(1, 2)

    assert [item.id for item in result] == [2, 3]


@pytest.mark.asyncio
async def test_personalized_products_excludes_seen_product() -> None:
    products = [
        product(1, "Pijama xanh", "Pijama"),
        product(2, "Pijama hồng", "Pijama"),
        product(3, "Váy công sở", "Váy"),
    ]
    repository = FakeProductRepository(products, [UserSignal(product_id=1, score=10)])
    service = RecommendationService(repository)

    result = await service.products_for_user(99, 2)

    assert [item.id for item in result] == [2, 3]
