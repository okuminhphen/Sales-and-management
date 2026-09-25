import type { V2EntityId, V2OffsetPagination } from "./database-v2";

/** Read-only organization directory record returned by Branch V2. */
export interface V2Branch {
  id: V2EntityId;
  code: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  type: "central" | "branch";
  managerEmployeeId: V2EntityId | null;
}

export interface V2BranchPage {
  branches: readonly V2Branch[];
  pagination: V2OffsetPagination;
}
