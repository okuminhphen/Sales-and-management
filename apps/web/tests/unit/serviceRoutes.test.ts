import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "../../src/middlewares/axiosConfig";
import { deleteCategory } from "../../src/services/categoryService";
import { deleteRole } from "../../src/services/roleService";
import { deleteSize } from "../../src/services/sizeService";
import { deleteVoucher } from "../../src/services/voucherService";
import { createNewProduct, getRecommendProductsForUser } from "../../src/services/productService";
import { loginUser } from "../../src/services/userService";
import { updateOrderStatus } from "../../src/services/orderService";

vi.mock("../../src/middlewares/axiosConfig", () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

describe("typed service routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [deleteCategory, "/category/delete/4"],
    [deleteRole, "/role/delete/4"],
    [deleteVoucher, "/voucher/delete/4"],
    [deleteSize, "/size/delete/4"],
  ])("sends an identifier in the URL without an invalid Axios config", (call, url) => {
    call(4);

    expect(axios.delete).toHaveBeenCalledWith(url);
  });

  it("does not send a browser-supplied user ID for personalized recommendations", () => {
    getRecommendProductsForUser();

    expect(axios.get).toHaveBeenCalledWith("/recommend-product", { params: { num: 10 } });
  });

  it("sends the login reCAPTCHA token in the login command instead of calling a legacy endpoint", () => {
    loginUser("customer@example.com", "password123", "captcha-token");

    expect(axios.post).toHaveBeenCalledWith("/login", {
      emailOrPhone: "customer@example.com",
      password: "password123",
      recaptchaToken: "captcha-token",
    });
  });

  it("creates product metadata as JSON then creates V2 variants", async () => {
    vi.mocked(axios.post)
      .mockResolvedValueOnce({ data: { EC: 0, EM: "created", DT: { id: "9007199254740993" } } } as never)
      .mockResolvedValue({ data: { EC: 0, EM: "variant", DT: { id: "11" } } } as never);
    vi.mocked(axios.get).mockResolvedValue({ data: { EC: 0, EM: "variants", DT: [] } } as never);
    const form = new FormData();
    form.append("name", "Áo khoác");
    form.append("price", "129000.0000");
    form.append("categoryId", "8");
    form.append("description", "Mô tả");
    form.append("sizes", JSON.stringify([{ sizeId: "3" }]));

    const response = await createNewProduct(form);

    expect(response.data.DT.id).toBe("9007199254740993");
    expect(axios.post).toHaveBeenNthCalledWith(1, "/product/create", {
      name: "Áo khoác",
      price: "129000.0000",
      categoryId: "8",
      description: "Mô tả",
      status: "active",
    });
    expect(axios.post).toHaveBeenNthCalledWith(2, "/product/9007199254740993/variants", {
      sizeId: "3",
      sku: "HAPPY-9007199254740993-3",
      status: "active",
    });
  });

  it("maps order cancellation to the guarded V2 transition then refreshes the order", async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { EC: 0, DT: { orderId: "7" } } } as never);
    vi.mocked(axios.get).mockResolvedValue({ data: { EC: 0, DT: { id: "7", status: "CANCELLED" } } } as never);

    await updateOrderStatus("7", { status: "CANCELLED" });

    expect(axios.post).toHaveBeenCalledWith("/order/7/cancel", {
      reason: "Cancelled by an authorized user",
    });
    expect(axios.get).toHaveBeenCalledWith("/order/7");
  });
});
