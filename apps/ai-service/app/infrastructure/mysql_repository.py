import json
from collections.abc import Mapping
from decimal import Decimal
from typing import Any, cast
from urllib.parse import urlparse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.sql.elements import TextClause

from app.domain.models import Product, UserSignal

_ACTIVE_SELLABLE_PRODUCT_SELECT = """
    SELECT p.id, p.name, p.description, p.base_price AS price, p.images,
           c.name AS category_name
    FROM products AS p
    JOIN categories AS c ON c.id = p.category_id
    WHERE p.status = 'active'
      AND EXISTS (
          SELECT 1
          FROM product_variants AS pv
          WHERE pv.product_id = p.id
            AND pv.status = 'active'
      )
"""

LIST_ACTIVE_SELLABLE_PRODUCTS_SQL = text(
    f"{_ACTIVE_SELLABLE_PRODUCT_SELECT}\nORDER BY p.id ASC"
)

FIND_ACTIVE_SELLABLE_PRODUCT_SQL = text(
    f"{_ACTIVE_SELLABLE_PRODUCT_SELECT}\n  AND p.id = :product_id\nLIMIT 1"
)

_LEGACY_USER_SIGNALS_SQL = text(
    """
    SELECT product_id, SUM(score) AS score
    FROM (
        SELECT productId AS product_id,
               (COALESCE(viewCount, 0) + COALESCE(isLiked, 0) * 5) AS score
        FROM UserBehavior WHERE userId = :user_id
        UNION ALL
        SELECT ps.productId AS product_id, 10 AS score
        FROM Cart AS c
        JOIN CartProductSize AS cps ON cps.cartId = c.id
        JOIN ProductSize AS ps ON ps.id = cps.productSizeId
        WHERE c.userId = :user_id
        UNION ALL
        SELECT od.productId AS product_id, 15 AS score
        FROM Orders AS o
        JOIN OrdersDetails AS od ON od.orderId = o.id
        WHERE o.userId = :user_id
    ) AS signals
    GROUP BY product_id
    """
)


class MySqlProductRepository:
    def __init__(self, database_url: str) -> None:
        self._engine: AsyncEngine = create_async_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=1_800,
        )

    async def list_products(self) -> list[Product]:
        rows = await self._fetch_rows(LIST_ACTIVE_SELLABLE_PRODUCTS_SQL)
        return [self._to_product(row) for row in rows]

    async def find_product_by_id(self, product_id: int) -> Product | None:
        rows = await self._fetch_rows(
            FIND_ACTIVE_SELLABLE_PRODUCT_SQL, {"product_id": product_id}
        )
        return self._to_product(rows[0]) if rows else None

    async def get_user_signals(self, user_id: int) -> list[UserSignal]:
        # Personalization behavior has its own V2 schema transition in T41.
        rows = await self._fetch_rows(_LEGACY_USER_SIGNALS_SQL, {"user_id": user_id})
        return [
            UserSignal(product_id=int(row["product_id"]), score=float(row["score"])) for row in rows
        ]

    async def close(self) -> None:
        await self._engine.dispose()

    async def _fetch_rows(
        self, statement: TextClause, parameters: dict[str, object] | None = None
    ) -> list[Mapping[str, Any]]:
        async with self._engine.connect() as connection:
            result = await connection.execute(statement, parameters or {})
            # Every selected column is explicitly aliased/named in this adapter.
            return cast(list[Mapping[str, Any]], list(result.mappings().all()))

    @staticmethod
    def _to_product(row: Mapping[str, Any]) -> Product:
        return Product(
            id=int(row["id"]),
            name=str(row["name"] or ""),
            description=str(row["description"] or ""),
            price=Decimal(str(row["price"] or 0)),
            images=MySqlProductRepository._public_image_urls(row["images"]),
            category_name=str(row["category_name"] or ""),
        )

    @staticmethod
    def _public_image_urls(value: Any) -> list[str]:
        raw = value
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except json.JSONDecodeError:
                return []
        if not isinstance(raw, list):
            return []

        urls: list[str] = []
        for item in raw:
            url: object | None = item if isinstance(item, str) else None
            if isinstance(item, Mapping):
                url = item.get("url")
            if isinstance(url, str) and MySqlProductRepository._is_public_http_url(url):
                urls.append(url)
        return urls

    @staticmethod
    def _is_public_http_url(value: str) -> bool:
        parsed = urlparse(value)
        return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
