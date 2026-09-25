/** Exact public scalar contracts shared by every Database V2 consumer. */
export type V2EntityId = string & { readonly __brand: "V2EntityId" };
export type V2Money = string & { readonly __brand: "V2Money" };

/** Offset pagination returned by V2 compatibility list endpoints. */
export interface V2OffsetPagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}
