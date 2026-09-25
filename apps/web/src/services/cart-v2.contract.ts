import { parseV2CatalogImage } from "./catalog-v2.contract";
import { parseV2EntityId, parseV2Money, parseV2OffsetPagination } from "./database-v2.contract";
import type { V2CatalogImage } from "../types/catalog-v2";
import type { V2CartItem, V2CartReadPage } from "../types/cart-v2";

type UnknownRecord = Record<string, unknown>;

const MAX_CART_QUANTITY = 2_147_483_647;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseText = (value: unknown, maximum: number): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value : null;

const parseImages = (value: unknown): readonly V2CatalogImage[] | null => {
  if (!Array.isArray(value)) return null;
  const images = value.map(parseV2CatalogImage);
  return images.every((image): image is V2CatalogImage => image !== null) ? images : null;
};

const parseQuantity = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= MAX_CART_QUANTITY
    ? value
    : null;

const parseCartItem = (value: unknown): V2CartItem | null => {
  if (!isRecord(value)) return null;

  const id = parseV2EntityId(value.id);
  const productId = parseV2EntityId(value.productId);
  const productVariantId = parseV2EntityId(value.productVariantId);
  const name = parseText(value.name, 255);
  const price = parseV2Money(value.price);
  const images = parseImages(value.images);
  const size = parseText(value.size, 255);
  const quantity = parseQuantity(value.quantity);

  if (!id || !productId || !productVariantId || !name || !price || !images || !size || !quantity ||
      typeof value.catalogActive !== "boolean") return null;

  return { id, productId, productVariantId, name, price, images, size, quantity, catalogActive: value.catalogActive };
};

/**
 * Validates the successful V2 cart compatibility response before Web stores or renders it.
 * It deliberately has no HTTP side effect while the V2 router remains unmounted.
 */
export const parseV2CartReadResponse = (value: unknown): V2CartReadPage | null => {
  if (!isRecord(value) || value.EC !== 0 || !Array.isArray(value.DT)) return null;

  const items = value.DT.map(parseCartItem);
  if (!items.every((item): item is V2CartItem => item !== null)) return null;

  const pagination = parseV2OffsetPagination(value.pagination, items.length);
  return pagination ? { items, pagination } : null;
};
