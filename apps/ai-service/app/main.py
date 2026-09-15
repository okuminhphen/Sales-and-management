import logging
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.responses import Response

from app.api.routes import create_router
from app.application.chat import ChatService
from app.application.ports import ChatModel, ProductRepository
from app.application.recommendations import RecommendationService
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.infrastructure.gemini_chat import GeminiChatModel, UnavailableChatModel
from app.infrastructure.mysql_repository import MySqlProductRepository


def create_app(
    *,
    settings: Settings | None = None,
    repository: ProductRepository | None = None,
    chat_model: ChatModel | None = None,
) -> FastAPI:
    resolved_settings = settings or get_settings()
    configure_logging(resolved_settings.log_level)
    logger = logging.getLogger(__name__)
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

    @application.middleware("http")
    async def log_request(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request_id = request.headers.get("x-request-id") or str(uuid4())
        started_at = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception as error:
            logger.exception(
                "http.request.failed",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "error": error,
                },
            )
            response = JSONResponse(
                status_code=500,
                content={
                    "error": {
                        "code": "INTERNAL_ERROR",
                        "message": "Internal server error",
                        "requestId": request_id,
                    }
                },
            )

        response.headers["X-Request-ID"] = request_id
        logger.info(
            "http.request.completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": round((time.perf_counter() - started_at) * 1000),
            },
        )
        return response

    application.include_router(create_router(recommendations, chat))
    return application


def _build_chat_model(settings: Settings) -> ChatModel:
    if not settings.gemini_api_key:
        return UnavailableChatModel()
    return GeminiChatModel(settings.gemini_api_key, settings.gemini_model)


app = create_app()
