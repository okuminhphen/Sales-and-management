declare const entityIdBrand: unique symbol;
declare const moneyBrand: unique symbol;

export type EntityId = string & { readonly [entityIdBrand]: "EntityId" };
export type Money = string & { readonly [moneyBrand]: "Money" };

export type ScalarContractErrorCode =
    | "ENTITY_ID_INVALID"
    | "ENTITY_ID_NUMBER_FORBIDDEN"
    | "ENTITY_ID_OUT_OF_RANGE"
    | "MONEY_INVALID"
    | "MONEY_NUMBER_FORBIDDEN"
    | "MONEY_OUT_OF_RANGE";

const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
const MAX_MONEY_INTEGER_DIGITS = 15;
const MONEY_SCALE = 4;

export class ScalarContractError extends TypeError {
    readonly code: ScalarContractErrorCode;

    constructor(code: ScalarContractErrorCode, message: string) {
        super(message);
        this.name = "ScalarContractError";
        this.code = code;
    }
}

/**
 * Serializes a signed MySQL BIGINT entity ID without passing through JS Number.
 */
export function serializeEntityId(value: unknown): EntityId {
    if (typeof value === "number") {
        throw new ScalarContractError(
            "ENTITY_ID_NUMBER_FORBIDDEN",
            "Entity IDs must be supplied as a bigint or decimal digit string.",
        );
    }

    if (typeof value !== "string" && typeof value !== "bigint") {
        throw new ScalarContractError("ENTITY_ID_INVALID", "Entity ID has an invalid type.");
    }
    let normalizedValue = value;
    if (typeof value === "string") {
        if (!/^\d+$/.test(value)) {
            throw new ScalarContractError("ENTITY_ID_INVALID", "Entity ID must contain decimal digits only.");
        }
        normalizedValue = value.replace(/^0+(?=\d)/, "");
        if (normalizedValue.length > 19) {
            throw new ScalarContractError(
                "ENTITY_ID_OUT_OF_RANGE",
                "Entity ID is outside the positive signed MySQL BIGINT range.",
            );
        }
    }

    const parsed = typeof normalizedValue === "bigint" ? normalizedValue : BigInt(normalizedValue);
    if (parsed <= 0n || parsed > MAX_SIGNED_BIGINT) {
        throw new ScalarContractError(
            "ENTITY_ID_OUT_OF_RANGE",
            "Entity ID is outside the positive signed MySQL BIGINT range.",
        );
    }

    return parsed.toString(10) as EntityId;
}

/**
 * Serializes non-negative DECIMAL(19,4) money as a canonical string.
 * Numeric input is rejected so precision cannot be lost before this boundary.
 */
export function serializeMoney(value: unknown): Money {
    if (typeof value === "number") {
        throw new ScalarContractError(
            "MONEY_NUMBER_FORBIDDEN",
            "Money must be supplied as a decimal string, never a JavaScript Number.",
        );
    }
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,4})?$/.test(value)) {
        throw new ScalarContractError(
            "MONEY_INVALID",
            "Money must be a non-negative decimal string with at most four fractional digits.",
        );
    }

    const [rawInteger, rawFraction = ""] = value.split(".");
    const integer = rawInteger.replace(/^0+(?=\d)/, "");
    if (integer.length > MAX_MONEY_INTEGER_DIGITS) {
        throw new ScalarContractError(
            "MONEY_OUT_OF_RANGE",
            "Money is outside the DECIMAL(19,4) range.",
        );
    }

    return `${integer}.${rawFraction.padEnd(MONEY_SCALE, "0")}` as Money;
}
