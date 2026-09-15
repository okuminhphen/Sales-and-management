from app.application.ports import ChatTurn
from app.domain.models import Product, UserSignal


class FakeProductRepository:
    def __init__(
        self,
        products: list[Product],
        signals: list[UserSignal] | None = None,
    ) -> None:
        self.products = products
        self.signals = signals or []

    async def list_products(self) -> list[Product]:
        return self.products

    async def get_user_signals(self, user_id: int) -> list[UserSignal]:
        del user_id
        return self.signals


class FakeChatModel:
    async def reply(
        self, message: str, products: list[Product], history: list[ChatTurn]
    ) -> dict[str, object]:
        del history
        return {"reply": f"Echo: {message}", "products": [products[0].to_public_dict()]}
