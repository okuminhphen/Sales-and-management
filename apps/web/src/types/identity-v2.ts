import type { V2EntityId } from "./database-v2";

export type { V2EntityId } from "./database-v2";

export type V2RoleScope =
  | Readonly<{ type: "global" }>
  | Readonly<{ type: "branch"; branchId: V2EntityId }>;

export interface V2RoleGrant {
  roleCode: string;
  scope: V2RoleScope;
}

export interface V2CustomerSession {
  token: string;
  accountId: V2EntityId;
  customerId: V2EntityId;
  /** Compatibility alias returned by V2 customer login; it must equal customerId. */
  userId: V2EntityId;
  email: string;
  userRole: Readonly<{ name: string }>;
}

export interface V2BackofficeSession {
  token: string;
  accountId: V2EntityId;
  /** Compatibility alias returned by V2 backoffice login; it must equal accountId. */
  adminId: V2EntityId;
  employeeId: V2EntityId | null;
  role: string;
  roleGrants: readonly V2RoleGrant[];
}

export interface V2OwnProfile {
  accountId: V2EntityId;
  customerId: V2EntityId | null;
  employeeId: V2EntityId | null;
  roles: readonly V2RoleGrant[];
}

export interface V2CustomerProfile {
  accountId: V2EntityId;
  customerId: V2EntityId;
  email: string;
  username: string | null;
  fullName: string | null;
  phone: string | null;
}
