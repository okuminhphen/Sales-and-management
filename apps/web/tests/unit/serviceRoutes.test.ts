import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "../../src/middlewares/axiosConfig";
import { deleteCategory } from "../../src/services/categoryService";
import { deleteRole } from "../../src/services/roleService";
import { deleteSize } from "../../src/services/sizeService";
import { deleteVoucher } from "../../src/services/voucherService";
import { getRecommendProductsForUser } from "../../src/services/productService";

vi.mock("../../src/middlewares/axiosConfig", () => ({
  default: {
    delete: vi.fn(),
    get: vi.fn(),
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
});
