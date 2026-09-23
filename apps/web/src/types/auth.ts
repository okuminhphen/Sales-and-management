export interface AdminSession {
  adminId: number;
  username?: string;
  email?: string;
  role: string;
  branchId?: number | null;
  token: string;
}

export interface GoogleAccessTokenCredential {
  access_token: string;
}

export interface AdminAccountDto {
  id: number;
  username: string;
  email: string;
  fullname?: string | null;
  phone?: string | null;
  status: "ACTIVE" | "INACTIVE";
  roleId?: number | null;
  branchId?: number | null;
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
  userId: number;
  email: string;
  userRole: RoleDto;
  branchId?: number | null;
  token: string;
  username?: string | null;
  fullname?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface UserDto {
  id: number;
  username: string;
  email: string;
  phone?: string | null;
  fullname?: string | null;
  address?: string | null;
  branchId?: number | null;
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
  id: number;
}

export type UpdateProfileInput = Partial<
  Pick<UserDto, "username" | "email" | "phone" | "fullname" | "address">
>;

export interface UpdatePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword?: string;
}
