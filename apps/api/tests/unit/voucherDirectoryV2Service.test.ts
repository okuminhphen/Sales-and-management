import { describe, expect, it, vi } from "vitest";
import {
    VoucherDirectoryV2Service,
    type VoucherDirectoryV2Repository,
} from "../../src/modules/commerce/application/voucher-directory-v2.service.js";
import { serializeEntityId, serializeMoney } from "../../src/shared/contracts/database-scalars.js";

const voucher = {
    id: serializeEntityId("9007199254740993"),
    code: "WELCOME10",
    description: "Khuyến mãi khách hàng mới",
    discountType: "percent" as const,
    discountValue: serializeMoney("10"),
    minOrderAmount: serializeMoney("100000"),
    maxDiscountAmount: serializeMoney("50000"),
    remainingUses: 7,
    endsAt: "2027-01-01T00:00:00.000Z",
};

describe("VoucherDirectoryV2Service", () => {
    it("returns only the repository allowlist", async () => {
        const repository: VoucherDirectoryV2Repository = {
            listActiveOnlineVouchers: vi.fn(async () => [voucher]),
        };
        await expect(new VoucherDirectoryV2Service(repository).listActiveOnline()).resolves.toEqual({
            kind: "vouchers",
            vouchers: [voucher],
        });
    });

    it("hides persistence errors", async () => {
        const repository: VoucherDirectoryV2Repository = {
            listActiveOnlineVouchers: vi.fn(async () => { throw new Error("database details"); }),
        };
        await expect(new VoucherDirectoryV2Service(repository).listActiveOnline()).resolves.toEqual({
            kind: "voucher_directory_unavailable",
        });
    });
});
