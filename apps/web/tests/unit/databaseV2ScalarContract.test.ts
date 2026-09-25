import { describe, expect, it } from "vitest";
import { parseV2EntityId, parseV2Money } from "../../src/services/database-v2.contract";

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
});
