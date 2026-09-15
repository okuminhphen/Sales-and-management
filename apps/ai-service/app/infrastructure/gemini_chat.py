import json

import anyio
from google import genai
from google.genai import types

from app.application.ports import ChatTurn
from app.domain.models import Product


class GeminiChatModel:
    def __init__(
        self,
        api_key: str,
        model: str,
        description_limit: int = 400,
        max_history_turns: int = 6,
        max_output_tokens: int = 800,
    ) -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._description_limit = description_limit
        self._max_history_turns = max_history_turns
        self._max_output_tokens = max_output_tokens

    async def reply(
        self, message: str, products: list[Product], history: list[ChatTurn]
    ) -> dict[str, object]:
        return await anyio.to_thread.run_sync(self._reply_sync, message, products, history)

    def _reply_sync(
        self, message: str, products: list[Product], history: list[ChatTurn]
    ) -> dict[str, object]:
        catalog = "\n".join(
            f"- id={product.id}; name={product.name}; category={product.category_name}; "
            f"price={product.price}; image={product.primary_image or ''}; "
            f"description={product.description[: self._description_limit]}"
            for product in products
        )
        response = self._client.models.generate_content(
            model=self._model,
            contents=[
                *[
                    types.Content(
                        role="model" if turn.role == "assistant" else "user",
                        parts=[types.Part.from_text(text=turn.content)],
                    )
                    for turn in history[-self._max_history_turns :]
                ],
                types.Content(role="user", parts=[types.Part.from_text(text=message)]),
            ],
            config=types.GenerateContentConfig(
                system_instruction=(
                    "Bạn là tư vấn viên của HappyShop. Chỉ dùng catalog được cung cấp, "
                    "không bịa sản phẩm hoặc giá. Trả JSON với hai khóa reply và products; "
                    "products là mảng gồm id, name, description, price, image.\n\n"
                    f"Catalog liên quan:\n{catalog}"
                ),
                response_mime_type="application/json",
                temperature=0.4,
                max_output_tokens=self._max_output_tokens,
            ),
        )
        try:
            payload = json.loads(response.text or "{}")
        except json.JSONDecodeError:
            payload = {"reply": response.text or "", "products": []}
        return {
            "reply": str(payload.get("reply") or "Mình chưa tìm được câu trả lời phù hợp."),
            "products": (
                payload.get("products") if isinstance(payload.get("products"), list) else []
            ),
        }


class UnavailableChatModel:
    async def reply(
        self, message: str, products: list[Product], history: list[ChatTurn]
    ) -> dict[str, object]:
        del message, products, history
        return {
            "reply": "Tính năng tư vấn AI chưa được cấu hình. Vui lòng thử lại sau.",
            "products": [],
        }
