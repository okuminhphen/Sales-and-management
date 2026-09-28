import { describe, expect, it } from "vitest";
import {
  formatV2Money,
  parseV2EntityId,
  parseV2Money,
  parseV2OffsetPagination,
} from "../../src/services/database-v2.contract";

describe("database V2 scalar contract", () => {
  it("preserves a signed BIGINT identifier as a string", () => {
    expect(parseV2EntityId("9223372036854775807")).toBe("9223372036854775807");
  });

  it("rejects a numeric or overflowing entity identifier", () => {
    expect(parseV2EntityId(42)).toBeNull();
    expect(parseV2EntityId("9223372036854775808")).toBeNull();
  });

  it("accepts canonical DECIMAL(19,4) money without converting through Number", () => {
    expect(parseV2Money("999999999999999.9999")).toBe("999999999999999.9999");
  });

  it("rejects lossy or non-canonical money values", () => {
    expect(parseV2Money(12.5)).toBeNull();
    expect(parseV2Money("12.5")).toBeNull();
    expect(parseV2Money("1000000000000000.0000")).toBeNull();
  });

  it("formats DECIMAL money without converting through Number", () => {
    expect(formatV2Money("999999999999999.9999")).toBe("999.999.999.999.999,9999");
    expect(formatV2Money("120000.0000")).toBe("120.000");
    expect(formatV2Money(120000)).toBeNull();
  });

  it("requires bounded and internally consistent V2 offset pagination", () => {
    expect(parseV2OffsetPagination(
      { page: 2, limit: 20, totalItems: 21, totalPages: 2 },
      1,
    )).toMatchObject({ page: 2, limit: 20, totalItems: 21, totalPages: 2 });
    expect(parseV2OffsetPagination(
      { page: 1, limit: 20, totalItems: 0, totalPages: 0 },
      1,
    )).toBeNull();
  });
});
