import { describe, expect, it } from "vitest";
import { branchV2Params } from "../../src/modules/identity-access/interfaces/http/branch-v2.dto.js";
import { employeeV2Params } from "../../src/modules/identity-access/interfaces/http/employee-v2.dto.js";
import { ownCustomerParamsV2 } from "../../src/modules/identity-access/interfaces/http/identity-v2.dto.js";

describe("identity-access V2 DTO entity IDs", () => {
  it.each([
    ["customer", ownCustomerParamsV2, { id: "9223372036854775807" }],
    ["branch", branchV2Params, { branchId: "9223372036854775807" }],
    ["employee", employeeV2Params, { employeeId: "9223372036854775807" }],
  ])("accepts the positive signed MySQL BIGINT maximum for %s", (_boundary, schema, input) => {
    expect(schema.safeParse(input).success).toBe(true);
  });

  it.each([
    ["customer", ownCustomerParamsV2, { id: "9223372036854775808" }],
    ["branch", branchV2Params, { branchId: "9223372036854775808" }],
    ["employee", employeeV2Params, { employeeId: "9223372036854775808" }],
  ])("rejects an overflow ID for %s", (_boundary, schema, input) => {
    expect(schema.safeParse(input).success).toBe(false);
  });
});
