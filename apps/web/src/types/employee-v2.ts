import type { V2EntityId, V2Money, V2OffsetPagination } from "./database-v2";

export interface V2Employee {
  id: V2EntityId;
  accountId: V2EntityId | null;
  branchId: V2EntityId;
  code: string;
  fullName: string;
  position: string | null;
  phone: string | null;
  email: string | null;
  salary: V2Money | null;
  status: "active" | "inactive";
  hiredAt: string | null;
}

export interface V2EmployeePage {
  employees: readonly V2Employee[];
  pagination: V2OffsetPagination;
}
