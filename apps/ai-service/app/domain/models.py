from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True, slots=True)
class Product:
    id: int
    name: str
    description: str
    price: Decimal
    images: list[str] | str | None
    category_name: str

    @property
    def primary_image(self) -> str | None:
        if isinstance(self.images, list):
            return self.images[0] if self.images else None
        if isinstance(self.images, str):
            return self.images.split(",", maxsplit=1)[0].strip() or None
        return None

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "product_id": self.id,
            "name": self.name,
            "description": self.description,
            "price": float(self.price),
            "images": self.images,
            "category_name": self.category_name,
        }


@dataclass(frozen=True, slots=True)
class UserSignal:
    product_id: int
    score: float
