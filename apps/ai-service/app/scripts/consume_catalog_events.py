import asyncio
import json
import logging

import aio_pika

from app.core.config import get_settings
from app.infrastructure.gemini_embeddings import GeminiEmbeddingModel
from app.infrastructure.mysql_repository import MySqlProductRepository
from app.infrastructure.qdrant_product_store import QdrantProductStore

logger = logging.getLogger(__name__)


async def run() -> None:
    settings = get_settings()
    if not settings.qdrant_enabled or not settings.gemini_api_key:
        raise RuntimeError(
            "QDRANT_ENABLED=true and GEMINI_API_KEY are required to consume catalog events"
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
    connection = await aio_pika.connect_robust(settings.rabbitmq_url)
    try:
        await store.ensure_collection()
        channel = await connection.channel()
        await channel.set_qos(prefetch_count=10)
        exchange = await channel.declare_exchange(
            "sales.domain-events", aio_pika.ExchangeType.TOPIC, durable=True
        )
        queue = await channel.declare_queue("ai.catalog-indexer", durable=True)
        await queue.bind(exchange, "catalog.product.*")

        async def consume(message: aio_pika.abc.AbstractIncomingMessage) -> None:
            async with message.process(requeue=True):
                event = json.loads(message.body)
                event_type = event.get("eventType")
                payload = event.get("payload") or {}
                product_id = int(payload["product_id"])
                if event_type == "catalog.product.deleted":
                    await store.delete(product_id)
                    return
                products = await repository.list_products()
                product = next((item for item in products if item.id == product_id), None)
                if product is None:
                    logger.warning(
                        "catalog.event.product_missing", extra={"product_id": product_id}
                    )
                    return
                document = " ".join(
                    (product.name, product.category_name, product.description)
                ).strip()
                await store.upsert(product, await embeddings.embed_document(document))

        await queue.consume(consume)
        logger.info("catalog.event.consumer_started")
        await asyncio.Future()
    finally:
        await repository.close()
        await store.close()
        await connection.close()


def main() -> None:
    asyncio.run(run())
