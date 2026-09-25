import { describe, expect, it } from "vitest";
import { parseV2CatalogProduct } from "../../src/services/catalog-v2.contract";

describe("catalog V2 response contract", () => {
  it("keeps product ID and base price as exact strings", () => {
    const product = parseV2CatalogProduct({
      id: "9007199254740993",
      categoryId: "9007199254740992",
      name: "Áo khoác",
      slug: "ao-khoac",
      description: null,
      basePrice: "129000.0000",
      images: [{ url: "https://cdn.example.test/products/jacket.jpg" }],
    });

    expect(product).toMatchObject({
      id: "9007199254740993",
      categoryId: "9007199254740992",
      basePrice: "129000.0000",
      images: [{ url: "https://cdn.example.test/products/jacket.jpg" }],
    });
  });

  it("rejects lossy scalars, non-canonical money and unsafe media", () => {
    expect(parseV2CatalogProduct({
      id: 7,
      categoryId: "8",
      name: "Áo khoác",
      slug: "ao-khoac",
      description: null,
      basePrice: "129000.0000",
      images: [],
    })).toBeNull();

    expect(parseV2CatalogProduct({
      id: "7",
      categoryId: "8",
      name: "Áo khoác",
      slug: "ao-khoac",
      description: null,
      basePrice: "129000",
      images: [{ url: "javascript:alert(1)" }],
    })).toBeNull();
  });
});
