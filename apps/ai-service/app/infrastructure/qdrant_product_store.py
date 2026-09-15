from qdrant_client import AsyncQdrantClient, models

from app.domain.models import Product


class QdrantProductStore:
    def __init__(self, url: str, api_key: str | None, collection: str, dimensions: int) -> None:
        self._client = AsyncQdrantClient(url=url, api_key=api_key, timeout=10)
        self._collection = collection
        self._dimensions = dimensions

    async def ensure_collection(self) -> None:
        if not await self._client.collection_exists(self._collection):
            await self._client.create_collection(
                collection_name=self._collection,
                vectors_config=models.VectorParams(
                    size=self._dimensions, distance=models.Distance.COSINE
                ),
            )

    async def upsert(self, product: Product, vector: list[float]) -> None:
        await self._client.upsert(
            collection_name=self._collection,
            points=[
                models.PointStruct(
                    id=product.id,
                    vector=vector,
                    payload={"product_id": product.id, "category": product.category_name},
                )
            ],
        )

    async def delete(self, product_id: int) -> None:
        await self._client.delete(
            collection_name=self._collection,
            points_selector=models.PointIdsList(points=[product_id]),
        )

    async def search(self, vector: list[float], limit: int) -> list[int]:
        results = await self._client.query_points(
            collection_name=self._collection,
            query=vector,
            limit=limit,
            with_payload=False,
        )
        return [int(point.id) for point in results.points]

    async def close(self) -> None:
        await self._client.close()
