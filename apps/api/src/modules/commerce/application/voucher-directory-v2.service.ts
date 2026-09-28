import type { EntityId, Money } from "../../../shared/contracts/database-scalars.js";

export type ActiveVoucher = {
    id: EntityId;
    code: string;
    description: string | null;
    discountType: "percent" | "fixed";
    discountValue: Money;
    minOrderAmount: Money;
    maxDiscountAmount: Money | null;
    remainingUses: number | null;
    endsAt: string;
};

export interface VoucherDirectoryV2Repository {
    listActiveOnlineVouchers: () => Promise<readonly ActiveVoucher[]>;
}

export type VoucherDirectoryResult =
    | { kind: "vouchers"; vouchers: readonly ActiveVoucher[] }
    | { kind: "voucher_directory_unavailable" };

/**
 * Public discovery is deliberately read-only. Eligibility is re-evaluated
 * under locks by checkout, so this directory is never an authorization or
 * pricing boundary.
 */
export class VoucherDirectoryV2Service {
    constructor(private readonly repository: VoucherDirectoryV2Repository) {}

    async listActiveOnline(): Promise<VoucherDirectoryResult> {
        try {
            return { kind: "vouchers", vouchers: await this.repository.listActiveOnlineVouchers() };
        } catch {
            return { kind: "voucher_directory_unavailable" };
        }
    }
}
