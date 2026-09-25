import { parseV2EntityId, parseV2OffsetPagination } from "./database-v2.contract";
import type { V2Branch, V2BranchPage } from "../types/branch-v2";

type UnknownRecord = Record<string, unknown>;

const BRANCH_CODE = /^[A-Z][A-Z0-9_-]{2,49}$/;

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

const parseBranch = (value: unknown): V2Branch | null => {
  if (!isRecord(value)) return null;
  const id = parseV2EntityId(value.id);
  const code = parseText(value.code, 50);
  const name = parseText(value.name, 255);
  const address = parseText(value.address, 500);
  const phone = parseNullableText(value.phone, 30);
  const email = parseNullableEmail(value.email);
  const managerEmployeeId = parseNullableEntityId(value.managerEmployeeId);
  const type = value.type === "central" || value.type === "branch" ? value.type : null;
  if (!id || !code || !BRANCH_CODE.test(code) || !name || !address || phone === undefined ||
      email === undefined || managerEmployeeId === undefined || !type) return null;
  return { id, code, name, address, phone, email, type, managerEmployeeId };
};

const parseSuccessfulData = (value: unknown): unknown | null =>
  isRecord(value) && value.EC === 0 ? value.DT : null;

/** Validates a single Branch V2 read response without making a runtime request. */
export const parseV2BranchDetailResponse = (value: unknown): V2Branch | null =>
  parseBranch(parseSuccessfulData(value));

/** Validates bounded Branch V2 directory metadata and records before Web consumption. */
export const parseV2BranchListResponse = (value: unknown): V2BranchPage | null => {
  const data = parseSuccessfulData(value);
  if (!Array.isArray(data) || !isRecord(value)) return null;
  const branches = data.map(parseBranch);
  if (!branches.every((branch): branch is V2Branch => branch !== null)) return null;
  const pagination = parseV2OffsetPagination(value.pagination, branches.length);
  return pagination ? { branches, pagination } : null;
};
