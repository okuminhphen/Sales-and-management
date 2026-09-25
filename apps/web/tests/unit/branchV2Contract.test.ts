import { describe, expect, it } from "vitest";
import { parseV2BranchDetailResponse, parseV2BranchListResponse } from "../../src/services/branch-v2.contract";

const branch = {
  id: "9007199254740993",
  code: "HN_01",
  name: "Chi nhánh Hà Nội",
  address: "1 Tràng Tiền, Hà Nội",
  phone: null,
  email: "hanoi@example.com",
  type: "branch",
  managerEmployeeId: "9007199254740992",
};

describe("branch V2 response contract", () => {
  it("keeps branch and manager IDs as exact strings", () => {
    expect(parseV2BranchListResponse({
      EM: "Get branches successfully",
      EC: 0,
      DT: [branch],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    })).toMatchObject({
      branches: [{ id: "9007199254740993", managerEmployeeId: "9007199254740992" }],
    });
  });

  it("accepts nullable contact and manager fields in a branch detail", () => {
    expect(parseV2BranchDetailResponse({
      EM: "Get branch successfully",
      EC: 0,
      DT: { ...branch, phone: null, email: null, managerEmployeeId: null, type: "central" },
    })).toMatchObject({ phone: null, email: null, managerEmployeeId: null, type: "central" });
  });

  it("rejects a lossy identifier, invalid email and non-success response", () => {
    expect(parseV2BranchDetailResponse({
      EM: "Get branch successfully",
      EC: 0,
      DT: { ...branch, id: 7 },
    })).toBeNull();
    expect(parseV2BranchDetailResponse({
      EM: "Get branch successfully",
      EC: 0,
      DT: { ...branch, email: "not-an-email" },
    })).toBeNull();
    expect(parseV2BranchDetailResponse({ EM: "Access denied", EC: 3, DT: null })).toBeNull();
  });
});
