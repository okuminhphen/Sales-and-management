import type { V2EntityId, V2Money, V2OffsetPagination } from "../types/database-v2";

const ENTITY_ID_PATTERN = /^[1-9]\d{0,18}$/;
const MAX_SIGNED_BIGINT = 9_223_372_036_854_775_807n;
const MONEY_PATTERN = /^(0|[1-9]\d{0,14})\.\d{4}$/;

/** Rejects numeric and lossy identifiers before a V2 response reaches application state. */
export const parseV2EntityId = (value: unknown): V2EntityId | null => {
  if (typeof value !== "string" || !ENTITY_ID_PATTERN.test(value)) return null;
  if (BigInt(value) > MAX_SIGNED_BIGINT) return null;
  return value as V2EntityId;
};

/** Accepts only canonical, non-negative DECIMAL(19,4) response values. */
export const parseV2Money = (value: unknown): V2Money | null =>
  typeof value === "string" && MONEY_PATTERN.test(value) ? value as V2Money : null;

/** Formats exact DECIMAL(19,4) text for vi-VN without a lossy Number conversion. */
export const formatV2Money = (value: unknown): string | null => {
  const money = parseV2Money(value);
  if (!money) return null;
  const [integer, decimal] = money.split(".");
  const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const significantDecimal = decimal.replace(/0+$/, "");
  return significantDecimal ? `${groupedInteger},${significantDecimal}` : groupedInteger;
};

/** Validates bounded offset metadata against the items already parsed from a V2 response. */
export const parseV2OffsetPagination = (value: unknown, itemCount: number): V2OffsetPagination | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { page, limit, totalItems, totalPages } = value as Record<string, unknown>;
  if (
    typeof page !== "number" || !Number.isSafeInteger(page) || page < 1 ||
    typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
    typeof totalItems !== "number" || !Number.isSafeInteger(totalItems) || totalItems < 0 ||
    typeof totalPages !== "number" || !Number.isSafeInteger(totalPages) || totalPages < 0 ||
    itemCount > limit || itemCount > totalItems || totalPages !== Math.ceil(totalItems / limit)
  ) return null;
  return { page, limit, totalItems, totalPages };
};
