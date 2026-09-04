import json
from collections.abc import Mapping
from contextlib import suppress
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.domain.models import Product, UserSignal


class MySqlProductRepository:
    def __init__(self, database_url: str) -> None:
        self._engine: AsyncEngine = create_async_engine(
            database_url,
            pool_pre_ping=True,
            pool_recycle=1_800,
        )

    async def list_products(self) -> list[Product]:
        statement = text(
            """
            SELECT p.id, p.name, p.description, p.price, p.images,
                   COALESCE(c.name, '') AS category_name
            FROM Product AS p
            LEFT JOIN Category AS c ON c.id = p.categoryId
            ORDER BY p.id
            """
        )
        async with self._engine.connect() as connection:
            rows = (await connection.execute(statement)).mappings().all()
        return [self._to_product(row) for row in rows]

    async def get_user_signals(self, user_id: int) -> list[UserSignal]:
        statement = text(
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
        async with self._engine.connect() as connection:
            rows = (await connection.execute(statement, {"user_id": user_id})).mappings().all()
        return [
            UserSignal(product_id=int(row["product_id"]), score=float(row["score"]))
            for row in rows
        ]

    async def close(self) -> None:
        await self._engine.dispose()

    @staticmethod
    def _to_product(row: Mapping[Any, Any]) -> Product:
        images = row["images"]
        if isinstance(images, str) and images.startswith("["):
            with suppress(json.JSONDecodeError):
                images = json.loads(images)
        return Product(
            id=int(row["id"]),
            name=str(row["name"] or ""),
            description=str(row["description"] or ""),
            price=Decimal(str(row["price"] or 0)),
            images=images,
            category_name=str(row["category_name"] or ""),
        )
