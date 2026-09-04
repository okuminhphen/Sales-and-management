from app.application.ports import ChatModel
from app.application.recommendations import RecommendationService


class ChatService:
    def __init__(self, recommendations: RecommendationService, model: ChatModel) -> None:
        self._recommendations = recommendations
        self._model = model

    async def reply(self, message: str) -> dict[str, object]:
        relevant_products = await self._recommendations.products_for_query(message)
        return await self._model.reply(message, relevant_products)
