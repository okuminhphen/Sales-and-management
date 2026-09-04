import json

import anyio
from google import genai
from google.genai import types

from app.domain.models import Product


class GeminiChatModel:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model

    async def reply(self, message: str, products: list[Product]) -> dict[str, object]:
        return await anyio.to_thread.run_sync(self._reply_sync, message, products)

    def _reply_sync(self, message: str, products: list[Product]) -> dict[str, object]:
        catalog = "\n".join(
            f"- id={product.id}; name={product.name}; category={product.category_name}; "
            f"price={product.price}; image={product.primary_image or ''}; "
            f"description={product.description[:300]}"
            for product in products
        )
        response = self._client.models.generate_content(
            model=self._model,
            contents=message,
            config=types.GenerateContentConfig(
                system_instruction=(
                    "Bạn là tư vấn viên của HappyShop. Chỉ dùng catalog được cung cấp, "
                    "không bịa sản phẩm hoặc giá. Trả JSON với hai khóa reply và products; "
                    "products là mảng gồm id, name, description, price, image.\n\n"
                    f"Catalog liên quan:\n{catalog}"
                ),
                response_mime_type="application/json",
                temperature=0.4,
                max_output_tokens=1_000,
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
    async def reply(self, message: str, products: list[Product]) -> dict[str, object]:
        del message, products
        return {
            "reply": "Tính năng tư vấn AI chưa được cấu hình. Vui lòng thử lại sau.",
            "products": [],
        }
