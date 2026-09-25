import type { V2CatalogImage } from "./catalog-v2";
import type { V2EntityId, V2Money, V2OffsetPagination } from "./database-v2";

/** Compatibility cart item returned by the V2 `/cart/read/:userId` endpoint. */
export interface V2CartItem {
  id: V2EntityId;
  productId: V2EntityId;
  productVariantId: V2EntityId;
  name: string;
  price: V2Money;
  images: readonly V2CatalogImage[];
  size: string;
  quantity: number;
  catalogActive: boolean;
}

export interface V2CartReadPage {
  items: readonly V2CartItem[];
  pagination: V2OffsetPagination;
}
