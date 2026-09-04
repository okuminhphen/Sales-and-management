from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import create_router
from app.application.chat import ChatService
from app.application.ports import ChatModel, ProductRepository
from app.application.recommendations import RecommendationService
from app.core.config import Settings, get_settings
from app.infrastructure.gemini_chat import GeminiChatModel, UnavailableChatModel
from app.infrastructure.mysql_repository import MySqlProductRepository


def create_app(
    *,
    settings: Settings | None = None,
    repository: ProductRepository | None = None,
    chat_model: ChatModel | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    owns_repository = repository is None
    product_repository = repository or MySqlProductRepository(resolved_settings.database_url)
    model = chat_model or _build_chat_model(resolved_settings)
    recommendations = RecommendationService(product_repository)
    chat = ChatService(recommendations, model)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield
        if owns_repository and isinstance(product_repository, MySqlProductRepository):
            await product_repository.close()

    application = FastAPI(
        title="HappyShop AI Service",
        version="2.0.0",
        lifespan=lifespan,
    )
    application.include_router(create_router(recommendations, chat))
    return application


def _build_chat_model(settings: Settings) -> ChatModel:
    if not settings.gemini_api_key:
        return UnavailableChatModel()
    return GeminiChatModel(settings.gemini_api_key, settings.gemini_model)


app = create_app()
