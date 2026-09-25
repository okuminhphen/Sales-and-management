/**
 * V2 identifiers cross the HTTP boundary as decimal strings. They are branded so
 * V2 consumers cannot accidentally fall back to the numeric legacy contract.
 */
export type V2EntityId = string & { readonly __brand: "V2EntityId" };

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
