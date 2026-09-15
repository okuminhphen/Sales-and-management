import anyio
from google import genai
from google.genai import types


class GeminiEmbeddingModel:
    """Gemini embedding adapter, isolated from application ranking policy."""

    def __init__(self, api_key: str, model: str, dimensions: int) -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._dimensions = dimensions

    async def embed_document(self, text: str) -> list[float]:
        return await anyio.to_thread.run_sync(self._embed, text, "RETRIEVAL_DOCUMENT")

    async def embed_query(self, text: str) -> list[float]:
        return await anyio.to_thread.run_sync(self._embed, text, "RETRIEVAL_QUERY")

    def _embed(self, text: str, task_type: str) -> list[float]:
        response = self._client.models.embed_content(
            model=self._model,
            contents=text,
            config=types.EmbedContentConfig(
                task_type=task_type,
                output_dimensionality=self._dimensions,
            ),
        )
        if not response.embeddings or response.embeddings[0].values is None:
            raise RuntimeError("Embedding provider returned no vector")
        return list(response.embeddings[0].values)
