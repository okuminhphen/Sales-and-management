from app.application.ports import ChatModel, ChatTurn
from app.application.recommendations import RecommendationService
from app.domain.models import ChatReply, Product

_FALLBACK_REPLY = "Mình chưa tìm được câu trả lời phù hợp."


def canonicalize_chat_result(
    result: dict[str, object], relevant_products: list[Product]
) -> ChatReply:
    """Treat model output as untrusted and hydrate products from the domain catalog."""
    raw_reply = result.get("reply")
    reply = raw_reply.strip() if isinstance(raw_reply, str) else ""
    if not reply:
        reply = _FALLBACK_REPLY

    allowed_products = {str(product.id): product for product in relevant_products}
    raw_products = result.get("products")
    if not isinstance(raw_products, list):
        return {"reply": reply, "products": []}

    selected_products = []
    selected_ids: set[str] = set()
    for raw_product in raw_products:
        if not isinstance(raw_product, dict):
            continue

        raw_id = raw_product.get("product_id", raw_product.get("id"))
        if isinstance(raw_id, bool):
            continue
        if isinstance(raw_id, int):
            product_id = str(raw_id)
        elif isinstance(raw_id, str) and raw_id.isascii() and raw_id.isdigit():
            product_id = str(int(raw_id))
        else:
            continue

        product = allowed_products.get(product_id)
        if product is None or product_id in selected_ids:
            continue
        selected_ids.add(product_id)
        selected_products.append(product.to_public_dict())

    return {"reply": reply, "products": selected_products}


class ChatService:
    def __init__(
        self, recommendations: RecommendationService, model: ChatModel, product_limit: int = 8
    ) -> None:
        self._recommendations = recommendations
        self._model = model
        self._product_limit = product_limit

    async def reply(self, message: str, history: list[ChatTurn] | None = None) -> ChatReply:
        relevant_products = await self._recommendations.products_for_query(
            message, self._product_limit
        )
        model_result = await self._model.reply(message, relevant_products, history or [])
        return canonicalize_chat_result(model_result, relevant_products)
