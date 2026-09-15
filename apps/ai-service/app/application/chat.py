from app.application.ports import ChatModel, ChatTurn
from app.application.recommendations import RecommendationService


class ChatService:
    def __init__(
        self, recommendations: RecommendationService, model: ChatModel, product_limit: int = 8
    ) -> None:
        self._recommendations = recommendations
        self._model = model
        self._product_limit = product_limit

    async def reply(self, message: str, history: list[ChatTurn] | None = None) -> dict[str, object]:
        relevant_products = await self._recommendations.products_for_query(
            message, self._product_limit
        )
        return await self._model.reply(message, relevant_products, history or [])
