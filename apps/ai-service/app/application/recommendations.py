import anyio
from sklearn.feature_extraction.text import TfidfVectorizer  # type: ignore[import-untyped]
from sklearn.metrics.pairwise import cosine_similarity  # type: ignore[import-untyped]

from app.application.ports import ProductRepository
from app.domain.models import Product


class RecommendationService:
    def __init__(self, repository: ProductRepository) -> None:
        self._repository = repository

    async def similar_products(self, product_id: int, limit: int = 10) -> list[Product]:
        products = await self._repository.list_products()
        return await anyio.to_thread.run_sync(self._rank_similar, products, product_id, limit)

    async def products_for_user(self, user_id: int, limit: int = 10) -> list[Product]:
        products = await self._repository.list_products()
        signals = await self._repository.get_user_signals(user_id)
        weights = {signal.product_id: signal.score for signal in signals}
        return await anyio.to_thread.run_sync(self._rank_for_user, products, weights, limit)

    async def products_for_query(self, query: str, limit: int = 20) -> list[Product]:
        products = await self._repository.list_products()
        return await anyio.to_thread.run_sync(self._rank_query, products, query, limit)

    @staticmethod
    def _documents(products: list[Product]) -> list[str]:
        return [
            " ".join((product.name, product.category_name, product.description)).strip()
            or "unknown"
            for product in products
        ]

    @classmethod
    def _rank_similar(
        cls, products: list[Product], product_id: int, limit: int
    ) -> list[Product]:
        if not products:
            return []
        try:
            selected_index = next(i for i, item in enumerate(products) if item.id == product_id)
        except StopIteration as error:
            raise LookupError(f"Product {product_id} was not found") from error

        matrix = TfidfVectorizer().fit_transform(cls._documents(products))
        scores = cosine_similarity(matrix[selected_index], matrix).ravel()
        ranked = sorted(
            (index for index in range(len(products)) if index != selected_index),
            key=lambda index: (-scores[index], products[index].id),
        )
        return [products[index] for index in ranked[:limit]]

    @classmethod
    def _rank_for_user(
        cls, products: list[Product], weights: dict[int, float], limit: int
    ) -> list[Product]:
        if not products:
            return []
        if not weights:
            return sorted(products, key=lambda product: product.id)[:limit]

        matrix = TfidfVectorizer().fit_transform(cls._documents(products))
        product_index = {product.id: index for index, product in enumerate(products)}
        excluded = set(weights)
        totals = [0.0] * len(products)

        for product_id, weight in weights.items():
            source_index = product_index.get(product_id)
            if source_index is None:
                continue
            similarities = cosine_similarity(matrix[source_index], matrix).ravel()
            for index, similarity in enumerate(similarities):
                if products[index].id not in excluded:
                    totals[index] += float(similarity) * weight

        candidates = [index for index, product in enumerate(products) if product.id not in excluded]
        candidates.sort(key=lambda index: (-totals[index], products[index].id))
        return [products[index] for index in candidates[:limit]]

    @classmethod
    def _rank_query(cls, products: list[Product], query: str, limit: int) -> list[Product]:
        if not products:
            return []
        documents = cls._documents(products)
        matrix = TfidfVectorizer().fit_transform([*documents, query])
        scores = cosine_similarity(matrix[-1], matrix[:-1]).ravel()
        ranked = sorted(
            range(len(products)),
            key=lambda index: (-scores[index], products[index].id),
        )
        return [products[index] for index in ranked[:limit]]
