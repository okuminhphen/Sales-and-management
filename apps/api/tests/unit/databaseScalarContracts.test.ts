import { describe, expect, it } from "vitest";
import {
    ScalarContractError,
    serializeEntityId,
    serializeMoney,
} from "../../src/shared/contracts/database-scalars.js";
import {
    mapLegacyEnvelopeData,
    type LegacyApiEnvelope,
} from "../../src/shared/contracts/legacy-api-envelope.js";

describe("Database V2 scalar contracts", () => {
    describe("BIGINT entity IDs", () => {
        it("serializes values larger than Number.MAX_SAFE_INTEGER without precision loss", () => {
            expect(serializeEntityId("9007199254740993")).toBe("9007199254740993");
            expect(serializeEntityId(9007199254740993n)).toBe("9007199254740993");
        });

        it("canonicalizes digit strings without converting through Number", () => {
            expect(serializeEntityId("00042")).toBe("42");
        });

        it.each([0, 42, Number.MAX_SAFE_INTEGER, "0", "-1", "1.5", "abc", null])(
            "rejects unsafe or invalid ID input %j",
            (value) => {
                expect(() => serializeEntityId(value)).toThrow(ScalarContractError);
            },
        );

        it("rejects values outside signed MySQL BIGINT range", () => {
            expect(() => serializeEntityId("9223372036854775808")).toThrowError(
                expect.objectContaining({ code: "ENTITY_ID_OUT_OF_RANGE" }),
            );
        });
    });

    describe("DECIMAL(19,4) money", () => {
        it("preserves large monetary values as canonical decimal strings", () => {
            expect(serializeMoney("999999999999999.1234")).toBe("999999999999999.1234");
            expect(serializeMoney("00199.9")).toBe("199.9000");
            expect(serializeMoney("0")).toBe("0.0000");
        });

        it.each([199.9, 0, "-0.0001", "1.23456", "1e3", "NaN", "", null])(
            "rejects number coercion or invalid money input %j",
            (value) => {
                expect(() => serializeMoney(value)).toThrow(ScalarContractError);
            },
        );

        it("rejects values outside DECIMAL(19,4) range", () => {
            expect(() => serializeMoney("1000000000000000.0000")).toThrowError(
                expect.objectContaining({ code: "MONEY_OUT_OF_RANGE" }),
            );
        });
    });

    it("maps response data without changing the legacy API envelope", () => {
        const envelope: LegacyApiEnvelope<{ id: bigint; total: string }> & {
            pagination: { page: number; totalItems: number };
        } = {
            EM: "Get order success",
            EC: 0,
            DT: { id: 9007199254740993n, total: "00199.9" },
            pagination: { page: 1, totalItems: 1 },
        };

        const mapped = mapLegacyEnvelopeData(envelope, (data) => ({
            id: serializeEntityId(data.id),
            total: serializeMoney(data.total),
        }));

        expect(mapped).toEqual({
            EM: "Get order success",
            EC: 0,
            DT: { id: "9007199254740993", total: "199.9000" },
            pagination: { page: 1, totalItems: 1 },
        });
        expect(Object.keys(mapped)).toEqual(["EM", "EC", "DT", "pagination"]);
    });
});
