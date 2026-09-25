/** Exact public scalar contracts shared by every Database V2 consumer. */
export type V2EntityId = string & { readonly __brand: "V2EntityId" };
export type V2Money = string & { readonly __brand: "V2Money" };
