import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    userFindByPk: vi.fn(),
    productFindByPk: vi.fn(),
    sizeFindByPk: vi.fn(),
    productSizeFindOne: vi.fn(),
    cartFindOrCreate: vi.fn(),
    cartFindOne: vi.fn(),
    cartItemFindOne: vi.fn(),
    cartItemCreate: vi.fn(),
    cartItemDestroy: vi.fn(),
}));

vi.mock("../../src/models/index.js", () => ({
    default: {
        User: { findByPk: mocks.userFindByPk },
        Product: { findByPk: mocks.productFindByPk },
        Size: { findByPk: mocks.sizeFindByPk },
        ProductSize: { findOne: mocks.productSizeFindOne },
        Cart: {
            findOrCreate: mocks.cartFindOrCreate,
            findOne: mocks.cartFindOne,
        },
        CartProductSize: {
            findOne: mocks.cartItemFindOne,
            create: mocks.cartItemCreate,
            destroy: mocks.cartItemDestroy,
        },
    },
}));

import cartService from "../../src/modules/cart/cart.service.js";

describe("cartService ownership and identifiers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.userFindByPk.mockResolvedValue({ id: 42 });
        mocks.productFindByPk.mockResolvedValue({ id: 7 });
        mocks.sizeFindByPk.mockResolvedValue({ id: 3 });
        mocks.productSizeFindOne.mockResolvedValue({ id: 55 });
        mocks.cartFindOrCreate.mockResolvedValue([{ id: 99, userId: 42 }]);
        mocks.cartItemFindOne.mockResolvedValue(null);
        mocks.cartItemCreate.mockResolvedValue({ id: 123 });
    });

    it("uses the resolved cart and product-size instead of hard-coded ids", async () => {
        const result = await cartService.addProductToCart({
            id: 7,
            userId: 42,
            sizeId: 3,
            quantity: 2,
        });

        expect(mocks.cartItemFindOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { cartId: 99, productSizeId: 55 },
            })
        );
        expect(mocks.cartItemCreate).toHaveBeenCalledWith({
            cartId: 99,
            productSizeId: 55,
            quantity: 2,
        });
        expect(result.EC).toBe(0);
    });

    it("does not update an item outside the authenticated user's cart", async () => {
        mocks.cartFindOne.mockResolvedValue({ id: 99, userId: 42 });
        mocks.cartItemFindOne.mockResolvedValue(null);

        const result = await cartService.updateProductInCart(
            { cartProductSizeId: 123, quantity: 2 },
            42
        );

        expect(mocks.cartItemFindOne).toHaveBeenCalledWith({
            where: { id: 123, cartId: 99 },
        });
        expect(result.EC).toBe(1);
    });

    it("scopes deletion to the authenticated user's cart", async () => {
        mocks.cartFindOne.mockResolvedValue({ id: 99, userId: 42 });
        mocks.cartItemDestroy.mockResolvedValue(1);

        const result = await cartService.deleteProductInCart(123, 42);

        expect(mocks.cartItemDestroy).toHaveBeenCalledWith({
            where: { id: 123, cartId: 99 },
        });
        expect(result.EC).toBe(0);
    });
});
