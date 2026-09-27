import os
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.core.config import Settings
from app.infrastructure.mysql_repository import MySqlProductRepository


@pytest.mark.asyncio
async def test_v2_catalog_repository_reads_only_active_products_with_an_active_variant() -> None:
    if os.getenv("RUN_DATABASE_V2_TESTS") != "true":
        pytest.skip("Set RUN_DATABASE_V2_TESTS=true to run MySQL V2 integration tests.")

    settings = Settings()
    if not settings.mysql_database.endswith("_test"):
        raise RuntimeError("AI MySQL integration tests require an explicit _test database.")

    token = uuid4().hex
    repository = MySqlProductRepository(settings.database_url)
    category_code = f"AI-{token[:20]}"
    category_slug = f"ai-{token}"
    size_name = f"ai-size-{token}"
    product_slug_prefix = f"ai-product-{token}"

    try:
        async with repository._engine.begin() as connection:
            await connection.execute(
                text(
                    """
                    INSERT INTO categories (code, name, slug, created_at, updated_at)
                    VALUES (:code, 'AI catalog test', :slug, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                    """
                ),
                {"code": category_code, "slug": category_slug},
            )
            category_id = int(
                (
                    await connection.execute(
                        text("SELECT id FROM categories WHERE code = :code"),
                        {"code": category_code},
                    )
                ).scalar_one()
            )
            await connection.execute(
                text(
                    """
                    INSERT INTO sizes (name, created_at, updated_at)
                    VALUES (:name, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                    """
                ),
                {"name": size_name},
            )
            size_id = int(
                (
                    await connection.execute(
                        text("SELECT id FROM sizes WHERE name = :name"), {"name": size_name}
                    )
                ).scalar_one()
            )

            async def insert_product(status: str, suffix: str) -> int:
                await connection.execute(
                    text(
                        """
                        INSERT INTO products
                        (category_id, name, slug, description, base_price, images,
                         status, created_at, updated_at)
                        VALUES (:category_id, :name, :slug, 'V2 catalog', '199000.0000',
                                JSON_ARRAY(JSON_OBJECT('url', 'https://cdn.example.com/product.jpg')),
                                :status, UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                        """
                    ),
                    {
                        "category_id": category_id,
                        "name": f"AI product {suffix}",
                        "slug": f"{product_slug_prefix}-{suffix}",
                        "status": status,
                    },
                )
                return int(
                    (
                        await connection.execute(
                            text("SELECT id FROM products WHERE slug = :slug"),
                            {"slug": f"{product_slug_prefix}-{suffix}"},
                        )
                    ).scalar_one()
                )

            sellable_id = await insert_product("active", "sellable")
            inactive_product_id = await insert_product("inactive", "inactive-product")
            inactive_variant_product_id = await insert_product("active", "inactive-variant")
            for product_id, status, suffix in (
                (sellable_id, "active", "sellable"),
                (inactive_product_id, "active", "inactive-product"),
                (inactive_variant_product_id, "inactive", "inactive-variant"),
            ):
                await connection.execute(
                    text(
                        """
                        INSERT INTO product_variants
                        (product_id, size_id, sku, status, created_at, updated_at)
                        VALUES (:product_id, :size_id, :sku, :status,
                                UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                        """
                    ),
                    {
                        "product_id": product_id,
                        "size_id": size_id,
                        "sku": f"AI-{token}-{suffix}",
                        "status": status,
                    },
                )

        products = await repository.list_products()
        sellable = await repository.find_product_by_id(sellable_id)
        inactive_product = await repository.find_product_by_id(inactive_product_id)
        inactive_variant = await repository.find_product_by_id(inactive_variant_product_id)

        found = [product for product in products if product.id in {
            sellable_id,
            inactive_product_id,
            inactive_variant_product_id,
        }]
        assert [product.id for product in found] == [sellable_id]
        assert sellable is not None
        assert sellable.images == ["https://cdn.example.com/product.jpg"]
        assert inactive_product is None
        assert inactive_variant is None
    finally:
        async with repository._engine.begin() as connection:
            await connection.execute(
                text("DELETE FROM product_variants WHERE sku LIKE :sku_prefix"),
                {"sku_prefix": f"AI-{token}-%"},
            )
            await connection.execute(
                text("DELETE FROM products WHERE slug LIKE :slug_prefix"),
                {"slug_prefix": f"{product_slug_prefix}-%"},
            )
            await connection.execute(
                text("DELETE FROM sizes WHERE name = :name"), {"name": size_name}
            )
            await connection.execute(
                text("DELETE FROM categories WHERE code = :code"), {"code": category_code}
            )
        await repository.close()
