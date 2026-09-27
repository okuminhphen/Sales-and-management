import { parseV2EntityId, parseV2Money, parseV2OffsetPagination } from "./database-v2.contract";
import type { V2Employee, V2EmployeePage } from "../types/employee-v2";

type UnknownRecord = Record<string, unknown>;

const EMPLOYEE_CODE = /^[A-Z][A-Z0-9_-]{2,49}$/;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseText = (value: unknown, maximum: number): string | null =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum ? value : null;

const parseNullableText = (value: unknown, maximum: number): string | null | undefined =>
  value === null ? null : parseText(value, maximum) ?? undefined;

const parseNullableEmail = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  const email = parseText(value, 255);
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : undefined;
};

const parseNullableEntityId = (value: unknown) =>
  value === null ? null : parseV2EntityId(value) ?? undefined;

const parseNullableMoney = (value: unknown) =>
  value === null ? null : parseV2Money(value) ?? undefined;

const parseNullableUtcTimestamp = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== "string" || value.length !== 24) return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value ? value : undefined;
};

const parseEmployee = (value: unknown): V2Employee | null => {
  if (!isRecord(value)) return null;
  const id = parseV2EntityId(value.id);
  const accountId = parseNullableEntityId(value.accountId);
  const branchId = parseV2EntityId(value.branchId);
  const code = parseText(value.code, 50);
  const fullName = parseText(value.fullName, 255);
  const position = parseNullableText(value.position, 150);
  const phone = parseNullableText(value.phone, 30);
  const email = parseNullableEmail(value.email);
  const salary = parseNullableMoney(value.salary);
  const hiredAt = parseNullableUtcTimestamp(value.hiredAt);
  const status = value.status === "active" || value.status === "inactive" ? value.status : null;
  if (!id || accountId === undefined || !branchId || !code || !EMPLOYEE_CODE.test(code) || !fullName ||
      position === undefined || phone === undefined || email === undefined || salary === undefined ||
      hiredAt === undefined || !status) return null;
  return { id, accountId, branchId, code, fullName, position, phone, email, salary, status, hiredAt };
};

/** Validates a bounded Employee V2 directory before Web state can consume it. */
export const parseV2EmployeeListResponse = (value: unknown): V2EmployeePage | null => {
  if (!isRecord(value) || value.EC !== 0 || !Array.isArray(value.DT)) return null;
  const employees = value.DT.map(parseEmployee);
  if (!employees.every((employee): employee is V2Employee => employee !== null)) return null;
  const pagination = parseV2OffsetPagination(value.pagination, employees.length);
  return pagination ? { employees, pagination } : null;
};
