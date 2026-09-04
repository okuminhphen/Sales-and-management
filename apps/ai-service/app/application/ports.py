from typing import Protocol

from app.domain.models import Product, UserSignal


class ProductRepository(Protocol):
    async def list_products(self) -> list[Product]: ...

    async def get_user_signals(self, user_id: int) -> list[UserSignal]: ...


class ChatModel(Protocol):
    async def reply(self, message: str, products: list[Product]) -> dict[str, object]: ...
