import { describe, expect, it } from "vitest";
import {
  parseV2BackofficeSession,
  parseV2CustomerProfile,
  parseV2CustomerSession,
  parseV2OwnProfile,
} from "../../src/services/identity-v2.contract";

describe("identity V2 response contract", () => {
  it("keeps BIGINT customer identifiers as exact strings", () => {
    const customerId = "9007199254740993";

    const session = parseV2CustomerSession({
      token: "signed-token",
      accountId: "9007199254740992",
      customerId,
      userId: customerId,
      email: "customer@example.com",
      userRole: { name: "CUSTOMER" },
    });

    expect(session).toMatchObject({
      accountId: "9007199254740992",
      customerId,
      userId: customerId,
      userRole: { name: "CUSTOMER" },
    });
  });

  it("rejects JavaScript numbers and a mismatched legacy user alias", () => {
    expect(parseV2CustomerSession({
      token: "signed-token",
      accountId: 42,
      customerId: "42",
      userId: "42",
      email: "customer@example.com",
      userRole: { name: "CUSTOMER" },
    })).toBeNull();

    expect(parseV2CustomerSession({
      token: "signed-token",
      accountId: "42",
      customerId: "43",
      userId: "42",
      email: "customer@example.com",
      userRole: { name: "CUSTOMER" },
    })).toBeNull();
  });

  it("rejects IDs outside the signed MySQL BIGINT schema range", () => {
    expect(parseV2CustomerSession({
      token: "signed-token",
      accountId: "9223372036854775808",
      customerId: "43",
      userId: "43",
      email: "customer@example.com",
      userRole: { name: "CUSTOMER" },
    })).toBeNull();
  });

  it("rejects a non-customer role from the customer session boundary", () => {
    expect(parseV2CustomerSession({
      token: "signed-token",
      accountId: "42",
      customerId: "43",
      userId: "43",
      email: "customer@example.com",
      userRole: { name: "SUPER_ADMIN" },
    })).toBeNull();
  });

  it("accepts a backoffice role only when it appears in DB-derived grants", () => {
    const session = parseV2BackofficeSession({
      token: "signed-token",
      accountId: "7",
      adminId: "7",
      employeeId: "8",
      role: "BRANCH_MANAGER",
      roleGrants: [{
        roleCode: "BRANCH_MANAGER",
        scope: { type: "branch", branchId: "9" },
      }],
    });

    expect(session?.roleGrants[0]).toMatchObject({
      roleCode: "BRANCH_MANAGER",
      scope: { type: "branch", branchId: "9" },
    });
  });

  it("rejects an ungranted backoffice role and invalid branch ID", () => {
    expect(parseV2BackofficeSession({
      token: "signed-token",
      accountId: "7",
      adminId: "7",
      employeeId: null,
      role: "BRANCH_MANAGER",
      roleGrants: [{ roleCode: "INVENTORY", scope: { type: "global" } }],
    })).toBeNull();

    expect(parseV2BackofficeSession({
      token: "signed-token",
      accountId: "7",
      adminId: "7",
      employeeId: null,
      role: "BRANCH_MANAGER",
      roleGrants: [{
        roleCode: "BRANCH_MANAGER",
        scope: { type: "branch", branchId: 9 },
      }],
    })).toBeNull();
  });

  it("rejects a customer role from the backoffice session boundary", () => {
    expect(parseV2BackofficeSession({
      token: "signed-token",
      accountId: "7",
      adminId: "7",
      employeeId: null,
      role: "CUSTOMER",
      roleGrants: [{ roleCode: "CUSTOMER", scope: { type: "global" } }],
    })).toBeNull();
  });

  it("accepts nullable customer and employee profile links without losing role scope", () => {
    const profile = parseV2OwnProfile({
      accountId: "11",
      customerId: null,
      employeeId: null,
      roles: [{ roleCode: "INTERNAL", scope: { type: "global" } }],
    });

    expect(profile).toMatchObject({
      accountId: "11",
      customerId: null,
      employeeId: null,
      roles: [{ roleCode: "INTERNAL", scope: { type: "global" } }],
    });
  });

  it("keeps an own customer profile on the V2 string ID contract", () => {
    const profile = parseV2CustomerProfile({
      userId: "9007199254740993",
      accountId: "9007199254740992",
      email: "customer@example.com",
      username: "customer",
      fullname: null,
      phone: null,
    });

    expect(profile).toMatchObject({
      customerId: "9007199254740993",
      accountId: "9007199254740992",
      fullName: null,
      phone: null,
    });
  });

  it("rejects a lossy customer profile ID or invalid nullable field", () => {
    expect(parseV2CustomerProfile({
      userId: 42,
      accountId: "7",
      email: "customer@example.com",
      username: "customer",
      fullname: null,
      phone: null,
    })).toBeNull();

    expect(parseV2CustomerProfile({
      userId: "42",
      accountId: "7",
      email: "customer@example.com",
      username: "customer",
      fullname: null,
      phone: 123,
    })).toBeNull();
  });
});
