import type {
  V2BackofficeSession,
  V2CustomerProfile,
  V2CustomerSession,
  V2EntityId,
  V2OwnProfile,
  V2RoleGrant,
  V2RoleScope,
} from "../types/identity-v2";
import { parseV2EntityId } from "./database-v2.contract";

export { parseV2EntityId } from "./database-v2.contract";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseText = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const parseNullableEntityId = (value: unknown): V2EntityId | null | undefined =>
  value === null ? null : parseV2EntityId(value) ?? undefined;

const parseNullableText = (value: unknown): string | null | undefined =>
  value === null ? null : parseText(value) ?? undefined;

const parseRoleScope = (value: unknown): V2RoleScope | null => {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  if (value.type === "global") return { type: "global" };
  if (value.type !== "branch") return null;

  const branchId = parseV2EntityId(value.branchId);
  return branchId ? { type: "branch", branchId } : null;
};

const parseRoleGrant = (value: unknown): V2RoleGrant | null => {
  if (!isRecord(value)) return null;
  const roleCode = parseText(value.roleCode);
  const scope = parseRoleScope(value.scope);
  return roleCode && scope ? { roleCode, scope } : null;
};

const parseRoleGrants = (value: unknown): readonly V2RoleGrant[] | null => {
  if (!Array.isArray(value)) return null;
  const grants = value.map(parseRoleGrant);
  return grants.every((grant): grant is V2RoleGrant => grant !== null) ? grants : null;
};

const parseEmail = (value: unknown): string | null => {
  const email = parseText(value);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
};

export const parseV2CustomerSession = (value: unknown): V2CustomerSession | null => {
  if (!isRecord(value) || !isRecord(value.userRole)) return null;

  const token = parseText(value.token);
  const accountId = parseV2EntityId(value.accountId);
  const customerId = parseV2EntityId(value.customerId);
  const userId = parseV2EntityId(value.userId);
  const email = parseEmail(value.email);
  const roleName = parseText(value.userRole.name);

  if (!token || !accountId || !customerId || !userId || customerId !== userId || !email || roleName !== "CUSTOMER") {
    return null;
  }

  return { token, accountId, customerId, userId, email, userRole: { name: roleName } };
};

export const parseV2BackofficeSession = (value: unknown): V2BackofficeSession | null => {
  if (!isRecord(value)) return null;

  const token = parseText(value.token);
  const accountId = parseV2EntityId(value.accountId);
  const adminId = parseV2EntityId(value.adminId);
  const employeeId = parseNullableEntityId(value.employeeId);
  const role = parseText(value.role);
  const roleGrants = parseRoleGrants(value.roleGrants);

  if (!token || !accountId || !adminId || accountId !== adminId || employeeId === undefined || !role || role === "CUSTOMER" || !roleGrants ||
      !roleGrants.some((grant) => grant.roleCode === role)) {
    return null;
  }

  return { token, accountId, adminId, employeeId, role, roleGrants };
};

export const parseV2OwnProfile = (value: unknown): V2OwnProfile | null => {
  if (!isRecord(value)) return null;

  const accountId = parseV2EntityId(value.accountId);
  const customerId = parseNullableEntityId(value.customerId);
  const employeeId = parseNullableEntityId(value.employeeId);
  const roles = parseRoleGrants(value.roles);

  if (!accountId || customerId === undefined || employeeId === undefined || !roles) return null;
  return { accountId, customerId, employeeId, roles };
};

/** Maps the compatibility `/user/:id` payload into the V2 customer aggregate. */
export const parseV2CustomerProfile = (value: unknown): V2CustomerProfile | null => {
  if (!isRecord(value)) return null;

  const customerId = parseV2EntityId(value.userId);
  const accountId = parseV2EntityId(value.accountId);
  const email = parseEmail(value.email);
  const username = parseNullableText(value.username);
  const fullName = parseNullableText(value.fullname);
  const phone = parseNullableText(value.phone);

  if (!customerId || !accountId || !email || username === undefined || fullName === undefined || phone === undefined) {
    return null;
  }
  return { customerId, accountId, email, username, fullName, phone };
};
