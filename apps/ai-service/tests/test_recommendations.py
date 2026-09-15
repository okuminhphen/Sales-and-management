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


class FakeEmbeddings:
    async def embed_document(self, text: str) -> list[float]:
        del text
        return [1.0, 0.0]

    async def embed_query(self, text: str) -> list[float]:
        del text
        return [1.0, 0.0]


class FakeVectorStore:
    async def ensure_collection(self) -> None:
        return None

    async def upsert(self, product: Product, vector: list[float]) -> None:
        del product, vector

    async def delete(self, product_id: int) -> None:
        del product_id

    async def search(self, vector: list[float], limit: int) -> list[int]:
        del vector, limit
        return [3, 2]


@pytest.mark.asyncio
async def test_query_prefers_semantic_vector_result_then_tfidf_fallback() -> None:
    products = [
        product(1, "Pijama xanh", "Pijama"),
        product(2, "Pijama hồng", "Pijama"),
        product(3, "Váy công sở", "Váy"),
    ]
    service = RecommendationService(
        FakeProductRepository(products),
        embeddings=FakeEmbeddings(),
        vector_store=FakeVectorStore(),
    )

    result = await service.products_for_query("Tìm sản phẩm phù hợp", 3)

    assert [item.id for item in result] == [3, 2, 1]
