export interface BranchDto {
  id: number;
  code?: string | null;
  name: string;
  address: string;
  phone: string;
  email: string;
  type: string;
  managerId?: number | null;
}

export type BranchInput = Pick<
  BranchDto,
  "name" | "address" | "phone" | "email" | "type"
>;

export interface EmployeeDto {
  id: number;
  code?: string | null;
  adminId?: number | null;
  branchId: number;
  name: string;
  position: string;
  phone: string;
  email: string;
  salary?: string | number | null;
  status: string;
  hiredAt?: string | null;
}

export type EmployeeInput = Omit<EmployeeDto, "id" | "code" | "hiredAt">;
