import re


def chunk_text(text: str, max_characters: int = 1_800, overlap_characters: int = 200) -> list[str]:
    """Split long knowledge-base text on sentence boundaries for future document RAG.

    Catalog products are intentionally not passed here: one concise product is one vector.
    """
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    if len(normalized) <= max_characters:
        return [normalized]

    sentences = re.split(r"(?<=[.!?])\s+", normalized)
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        candidate = f"{current} {sentence}".strip()
        if current and len(candidate) > max_characters:
            chunks.append(current)
            overlap = current[-overlap_characters:].strip() if overlap_characters else ""
            current = f"{overlap} {sentence}".strip()
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks
