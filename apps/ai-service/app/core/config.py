from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "sales-ai-service"
    app_env: str = Field(default="development", alias="NODE_ENV")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    mysql_host: str = Field(default="localhost", alias="MYSQL_HOST")
    mysql_port: int = Field(default=3306, alias="MYSQL_PORT")
    mysql_database: str = Field(default="btl_tmdt", alias="MYSQL_DATABASE")
    mysql_user: str = Field(default="root", alias="MYSQL_USER")
    mysql_password: str = Field(default="", alias="MYSQL_PASSWORD")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_embedding_model: str = Field(
        default="gemini-embedding-001", alias="GEMINI_EMBEDDING_MODEL"
    )
    embedding_dimensions: int = Field(default=768, alias="EMBEDDING_DIMENSIONS")
    qdrant_enabled: bool = Field(default=False, alias="QDRANT_ENABLED")
    qdrant_url: str = Field(default="http://localhost:6333", alias="QDRANT_URL")
    qdrant_api_key: str | None = Field(default=None, alias="QDRANT_API_KEY")
    qdrant_collection: str = Field(default="catalog_products_v1", alias="QDRANT_COLLECTION")
    rag_product_limit: int = Field(default=8, alias="RAG_PRODUCT_LIMIT")
    rag_description_char_limit: int = Field(default=400, alias="RAG_DESCRIPTION_CHAR_LIMIT")
    chat_history_turn_limit: int = Field(default=6, alias="CHAT_HISTORY_TURN_LIMIT")
    chat_max_output_tokens: int = Field(default=800, alias="CHAT_MAX_OUTPUT_TOKENS")
    rabbitmq_url: str = Field(
        default="amqp://sales_app:local-rabbitmq-password-change-me@localhost:5672/sales_dev",
        alias="RABBITMQ_URL",
    )

    @property
    def database_url(self) -> str:
        user = quote_plus(self.mysql_user)
        password = quote_plus(self.mysql_password)
        return (
            f"mysql+asyncmy://{user}:{password}@{self.mysql_host}:"
            f"{self.mysql_port}/{self.mysql_database}?charset=utf8mb4"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
