import { parseV2EntityId, parseV2Money } from "./database-v2.contract";
import type { V2CatalogImage, V2CatalogProduct } from "../types/catalog-v2";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseText = (value: unknown, maximum: number): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value : null;

const parseDescription = (value: unknown): string | null | undefined =>
  value === null ? null : parseText(value, 5_000) ?? undefined;

const parseImage = (value: unknown): V2CatalogImage | null => {
  if (!isRecord(value)) return null;
  const url = parseText(value.url, 2_000);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? { url } : null;
  } catch {
    return null;
  }
};

const parseImages = (value: unknown): readonly V2CatalogImage[] | null => {
  if (!Array.isArray(value)) return null;
  const images = value.map(parseImage);
  return images.every((image): image is V2CatalogImage => image !== null) ? images : null;
};

/** Validates the public catalog response before it is rendered or stored by Web. */
export const parseV2CatalogProduct = (value: unknown): V2CatalogProduct | null => {
  if (!isRecord(value)) return null;

  const id = parseV2EntityId(value.id);
  const categoryId = parseV2EntityId(value.categoryId);
  const name = parseText(value.name, 255);
  const slug = parseText(value.slug, 255);
  const description = parseDescription(value.description);
  const basePrice = parseV2Money(value.basePrice);
  const images = parseImages(value.images);

  if (!id || !categoryId || !name || !slug || description === undefined || !basePrice || !images) return null;
  return { id, categoryId, name, slug, description, basePrice, images };
};
