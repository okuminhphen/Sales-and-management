import type { V2EntityId, V2Money } from "../types/database-v2";

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
