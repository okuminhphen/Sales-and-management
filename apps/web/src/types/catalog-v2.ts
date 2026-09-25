import type { V2EntityId, V2Money } from "./database-v2";

export interface V2CatalogImage {
  url: string;
}

/** Public, sellable product read model returned by the V2 catalog API. */
export interface V2CatalogProduct {
  id: V2EntityId;
  categoryId: V2EntityId;
  name: string;
  slug: string;
  description: string | null;
  basePrice: V2Money;
  images: readonly V2CatalogImage[];
}
