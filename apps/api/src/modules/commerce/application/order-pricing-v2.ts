import { serializeMoney, type Money } from "../../../shared/contracts/database-scalars.js";

type PricedLine = { unitPrice: string; quantity: number };
type AllocatedLine = { discountAmount: Money; lineTotal: Money };
type Allocation = {
    subtotalAmount: Money; discountAmount: Money; totalAmount: Money;
    lines: readonly AllocatedLine[];
};

const SCALE = 10_000n;
const scaledMoney = (value: string): bigint => BigInt(serializeMoney(value).replace(".", ""));
const wholeDong = (value: string): bigint => {
    const scaled = scaledMoney(value);
    if (scaled % SCALE !== 0n) throw new RangeError("VND order amounts must be whole dong.");
    return scaled / SCALE;
};
const roundedDong = (value: string): bigint => (scaledMoney(value) + SCALE / 2n) / SCALE;
const toMoney = (dong: bigint): Money => serializeMoney(`${dong}.0000`);

/** Allocate a whole-VND voucher discount by largest remainder; ties follow canonical input order. */
export const allocateOrderDiscountV2 = (items: readonly PricedLine[], discount: string): Allocation => {
    if (items.length === 0) throw new RangeError("An order needs at least one line.");
    const lineGross = items.map(({ unitPrice, quantity }) => {
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2_147_483_647) {
            throw new RangeError("Invalid order quantity.");
        }
        return roundedDong(unitPrice) * BigInt(quantity);
    });
    const subtotal = lineGross.reduce((sum, value) => sum + value, 0n);
    const subtotalAmount = toMoney(subtotal);
    const discountDong = wholeDong(discount);
    if (discountDong > subtotal) throw new RangeError("Discount exceeds order subtotal.");
    const discountAmount = toMoney(discountDong);
    const totalAmount = toMoney(subtotal - discountDong);
    if (subtotal === 0n) {
        return { subtotalAmount, discountAmount, totalAmount,
            lines: lineGross.map(() => ({ discountAmount: toMoney(0n), lineTotal: toMoney(0n) })) };
    }

    const shares = lineGross.map((gross) => gross * discountDong / subtotal);
    let remaining = discountDong - shares.reduce((sum, share) => sum + share, 0n);
    const byRemainder = lineGross.map((gross, index) => ({
        index, remainder: gross * discountDong % subtotal,
    })).sort((a, b) => a.remainder === b.remainder ? a.index - b.index
        : a.remainder > b.remainder ? -1 : 1);
    for (const { index } of byRemainder) {
        if (remaining === 0n) break;
        shares[index] += 1n;
        remaining -= 1n;
    }
    return { subtotalAmount, discountAmount, totalAmount,
        lines: lineGross.map((gross, index) => ({
            discountAmount: toMoney(shares[index]), lineTotal: toMoney(gross - shares[index]),
        })) };
};
