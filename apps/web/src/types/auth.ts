import type { EntityId } from "./http";

export interface AdminSession {
  adminId: EntityId;
  username?: string;
  email?: string;
  role: string;
  branchId?: EntityId | null;
  token: string;
}

export interface GoogleAccessTokenCredential {
  access_token: string;
}

export interface AdminAccountDto {
  id: EntityId;
  username: string;
  email: string;
  fullname?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE";
  roleId?: number | null;
  branchId?: EntityId | null;
  role?: { id: number; name: string } | null;
}

export interface AdminAccountInput {
  username: string;
  email: string;
  fullname?: string;
  phone?: string;
  password?: string;
  status: "ACTIVE" | "INACTIVE";
  roleId: number | null;
  branchId: number | null;
}

export interface RoleDto {
  id: number;
  name: string;
}

export interface UserSession {
  userId: EntityId;
  email: string;
  userRole: RoleDto;
  branchId?: EntityId | null;
  token: string;
  username?: string | null;
  fullname?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface UserDto {
  id: EntityId;
  username: string;
  email: string;
  phone?: string | null;
  fullname?: string | null;
  address?: string | null;
  branchId?: EntityId | null;
  roles?: RoleDto[];
}

export interface CreateUserInput {
  username: string;
  email: string;
  phone: string;
  password: string;
  roleId: number;
}

export interface UpdateUserByAdminInput extends CreateUserInput {
  id: EntityId;
}

export type UpdateProfileInput = Partial<
  Pick<UserDto, "username" | "email" | "phone" | "fullname" | "address">
>;

export interface UpdatePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}
