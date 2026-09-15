from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.application.chat import ChatService
from app.application.ports import ChatTurn
from app.application.recommendations import RecommendationService


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2_000)
    history: list["ChatHistoryItem"] = Field(default_factory=list, max_length=6)


class ChatHistoryItem(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=1_000)


class ChatResponse(BaseModel):
    reply: str
    products: list[dict[str, object]] = Field(default_factory=list)


def create_router(
    recommendations: RecommendationService,
    chat: ChatService,
) -> APIRouter:
    router = APIRouter()

    @router.get("/health/live", tags=["health"])
    async def liveness() -> dict[str, str]:
        return {"status": "ok"}

    @router.get("/recommend/{product_id}", tags=["recommendations"])
    async def recommend_product(
        product_id: int,
        limit: Annotated[int, Query(ge=1, le=50)] = 10,
    ) -> list[dict[str, object]]:
        try:
            products = await recommendations.similar_products(product_id, limit)
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        return [product.to_public_dict() for product in products]

    @router.get("/recommend-product-for-user", tags=["recommendations"])
    async def recommend_for_user(
        user_id: Annotated[int, Query(alias="userId", gt=0)],
        limit: Annotated[int, Query(alias="num", ge=1, le=50)] = 10,
    ) -> dict[str, object]:
        products = await recommendations.products_for_user(user_id, limit)
        return {
            "user_id": user_id,
            "recommendations": [product.to_public_dict() for product in products],
        }

    @router.post("/chat", response_model=ChatResponse, tags=["chat"])
    async def chat_with_customer(payload: ChatRequest) -> dict[str, object]:
        history = [ChatTurn(item.role, item.content.strip()) for item in payload.history]
        return await chat.reply(payload.message.strip(), history)

    return router
