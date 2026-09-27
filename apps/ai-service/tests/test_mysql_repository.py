from collections.abc import Mapping
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy.sql.elements import TextClause

from app.infrastructure.mysql_repository import (
    FIND_ACTIVE_SELLABLE_PRODUCT_SQL,
    LIST_ACTIVE_SELLABLE_PRODUCTS_SQL,
    MySqlProductRepository,
)


class StubMySqlProductRepository(MySqlProductRepository):
    def __init__(self, rows: list[Mapping[str, Any]]) -> None:
        self.rows = rows
        self.calls: list[tuple[str, dict[str, object] | None]] = []

    async def _fetch_rows(
        self, statement: TextClause, parameters: dict[str, object] | None = None
    ) -> list[Mapping[str, Any]]:
        self.calls.append((str(statement), parameters))
        return self.rows


def test_v2_catalog_queries_only_select_active_sellable_catalog() -> None:
    list_query = str(LIST_ACTIVE_SELLABLE_PRODUCTS_SQL)
    find_query = str(FIND_ACTIVE_SELLABLE_PRODUCT_SQL)

    for query in (list_query, find_query):
        assert "FROM products AS p" in query
        assert "JOIN categories AS c" in query
        assert "FROM product_variants AS pv" in query
        assert "p.status = 'active'" in query
        assert "pv.status = 'active'" in query
        assert "Product AS" not in query
        assert "ProductSize" not in query

    assert "p.id = :product_id" in find_query
    assert "LIMIT 1" in find_query


@pytest.mark.asyncio
async def test_v2_catalog_repository_maps_safe_public_images_and_queries_one_product() -> None:
    repository = StubMySqlProductRepository(
        [
            {
                "id": 42,
                "name": "Váy dự tiệc",
                "description": None,
                "price": "1250000.0000",
                "images": '[{"url":"https://cdn.example.com/dress.jpg","publicId":"private"},'
                '"javascript:alert(1)",{"url":"/not-public.jpg"}]',
                "category_name": "Váy",
            }
        ]
    )

    product = await repository.find_product_by_id(42)

    assert product is not None
    assert product.id == 42
    assert product.description == ""
    assert product.price == Decimal("1250000.0000")
    assert product.images == ["https://cdn.example.com/dress.jpg"]
    assert repository.calls == [(str(FIND_ACTIVE_SELLABLE_PRODUCT_SQL), {"product_id": 42})]


@pytest.mark.asyncio
async def test_v2_catalog_repository_returns_none_when_product_is_not_sellable() -> None:
    repository = StubMySqlProductRepository([])

    product = await repository.find_product_by_id(7)

    assert product is None
