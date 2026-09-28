from decimal import Decimal

from app.application.chat import canonicalize_chat_result
from app.domain.models import Product


def test_canonicalize_chat_result_rejects_hallucinated_and_tampered_products() -> None:
    products = [
        Product(1, "Áo thật", "Mô tả thật", Decimal("125000"), ["real.jpg"], "Áo"),
        Product(2, "Quần thật", "Mô tả thật", Decimal("250000"), None, "Quần"),
    ]
    untrusted_result: dict[str, object] = {
        "reply": "Gợi ý của model",
        "products": [
            {"product_id": "1", "name": "Tên giả", "price": "1"},
            {"id": 2, "name": "Tên giả thứ hai", "price": "0"},
            {"product_id": "999", "name": "Sản phẩm bịa"},
            {"product_id": "1"},
            {"product_id": True},
            "invalid",
        ],
    }

    result = canonicalize_chat_result(untrusted_result, products)

    assert result == {
        "reply": "Gợi ý của model",
        "products": [
            {
                "product_id": "1",
                "name": "Áo thật",
                "description": "Mô tả thật",
                "price": "125000.0000",
                "images": ["real.jpg"],
                "category_name": "Áo",
            },
            {
                "product_id": "2",
                "name": "Quần thật",
                "description": "Mô tả thật",
                "price": "250000.0000",
                "images": None,
                "category_name": "Quần",
            },
        ],
    }


def test_canonicalize_chat_result_handles_invalid_model_shape() -> None:
    result = canonicalize_chat_result({"reply": 123, "products": "invalid"}, [])

    assert result["reply"] == "Mình chưa tìm được câu trả lời phù hợp."
    assert result["products"] == []
