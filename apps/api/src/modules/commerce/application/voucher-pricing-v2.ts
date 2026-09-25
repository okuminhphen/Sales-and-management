import { serializeMoney, type Money } from "../../../shared/contracts/database-scalars.js";

type VoucherDiscount = {
    subtotal: string;
    discountType: "fixed" | "percent";
    discountValue: string;
    maxDiscountAmount: string | null;
};

const SCALE = 10_000n;

const scaled = (value: string): bigint => BigInt(serializeMoney(value).replace(".", ""));
const roundToDong = (value: bigint): bigint => (value + SCALE / 2n) / SCALE;

/** Returns a whole-VND discount; the caller must still allocate it across order lines. */
export const calculateVoucherDiscountV2 = (voucher: VoucherDiscount): Money => {
    const subtotal = scaled(voucher.subtotal);
    const value = scaled(voucher.discountValue);
    if (value <= 0n || (voucher.discountType === "percent" && value > 100n * SCALE)) {
        throw new RangeError("Invalid voucher discount value.");
    }
    const discountDong = voucher.discountType === "fixed"
        ? roundToDong(value)
        : (subtotal * value + 5_000_000_000n) / 10_000_000_000n;
    const subtotalCap = subtotal / SCALE;
    const configuredCap = voucher.maxDiscountAmount === null
        ? subtotalCap : scaled(voucher.maxDiscountAmount) / SCALE;
    const bounded = [discountDong, subtotalCap, configuredCap].reduce((min, current) => current < min ? current : min);
    return serializeMoney(`${bounded}.0000`);
};
