import asyncio

from app.core.config import get_settings
from app.infrastructure.gemini_embeddings import GeminiEmbeddingModel
from app.infrastructure.mysql_repository import MySqlProductRepository
from app.infrastructure.qdrant_product_store import QdrantProductStore


async def run() -> int:
    settings = get_settings()
    if not settings.qdrant_enabled or not settings.gemini_api_key:
        raise RuntimeError(
            "QDRANT_ENABLED=true and GEMINI_API_KEY are required to sync the catalog"
        )
    repository = MySqlProductRepository(settings.database_url)
    store = QdrantProductStore(
        settings.qdrant_url,
        settings.qdrant_api_key,
        settings.qdrant_collection,
        settings.embedding_dimensions,
    )
    embeddings = GeminiEmbeddingModel(
        settings.gemini_api_key, settings.gemini_embedding_model, settings.embedding_dimensions
    )
    try:
        await store.ensure_collection()
        products = await repository.list_products()
        for product in products:
            document = " ".join((product.name, product.category_name, product.description)).strip()
            await store.upsert(product, await embeddings.embed_document(document))
        return len(products)
    finally:
        await repository.close()
        await store.close()


def main() -> None:
    count = asyncio.run(run())
    print(f"Synced {count} products to Qdrant")
