import { describe, expect, it } from "vitest";
import { parseV2EmployeeListResponse } from "../../src/services/employee-v2.contract";

describe("employee V2 response contract", () => {
  it("keeps IDs and salary as exact strings", () => {
    const page = parseV2EmployeeListResponse({
      EM: "Get employees successfully",
      EC: 0,
      DT: [{
        id: "9007199254740993",
        accountId: null,
        branchId: "9007199254740992",
        code: "EMP_01",
        fullName: "Nguyễn Văn A",
        position: "Sales staff",
        phone: null,
        email: "employee@example.com",
        salary: "12000000.0000",
        status: "active",
        hiredAt: "2026-09-27T00:00:00.000Z",
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    });

    expect(page).toMatchObject({
      employees: [{ id: "9007199254740993", branchId: "9007199254740992", salary: "12000000.0000" }],
    });
  });

  it("accepts nullable account, contact, salary and hired date", () => {
    expect(parseV2EmployeeListResponse({
      EM: "Get employees successfully",
      EC: 0,
      DT: [{
        id: "7", accountId: null, branchId: "8", code: "EMP_02", fullName: "Nhân viên B",
        position: null, phone: null, email: null, salary: null, status: "inactive", hiredAt: null,
      }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    })).toMatchObject({ employees: [{ accountId: null, salary: null, hiredAt: null, status: "inactive" }] });
  });

  it("rejects lossy values and a non-success envelope", () => {
    expect(parseV2EmployeeListResponse({
      EM: "Get employees successfully", EC: 0,
      DT: [{ id: 7, accountId: null, branchId: "8", code: "EMP_02", fullName: "Nhân viên B",
        position: null, phone: null, email: null, salary: null, status: "inactive", hiredAt: null }],
      pagination: { page: 1, limit: 20, totalItems: 1, totalPages: 1 },
    })).toBeNull();
    expect(parseV2EmployeeListResponse({ EM: "Access denied", EC: 3, DT: [] })).toBeNull();
  });
});
