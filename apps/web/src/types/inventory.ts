export type TransferReceiptStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export interface TransferReceiptDto {
  id: number;
  code?: string | null;
  fromBranchId?: number | null;
  toBranchId?: number | null;
  status: TransferReceiptStatus;
  items?: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export type StockRequestStatus = "pending" | "approved" | "rejected";

export interface StockRequestItemInput {
  productSizeId: number;
  quantity: number;
  note?: string;
}

export interface StockRequestDto {
  id: number;
  code: string;
  fromBranchId: number;
  toBranchId: number;
  status: StockRequestStatus;
  createdBy: number;
  approvedBy?: number | null;
  items?: unknown[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateStockRequestInput {
  fromBranchId: number;
  toBranchId: number;
  items: StockRequestItemInput[];
}

export interface UpdateStockRequestInput {
  toBranchId: number;
  note?: string;
  items: StockRequestItemInput[];
}
