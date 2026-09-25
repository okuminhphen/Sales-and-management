import { describe, expect, it, vi } from "vitest";
import type { V2Persistence } from "../../src/database/v2/persistence.js";
import { SequelizeTransferReceiptV2Repository } from "../../src/modules/inventory-transfer/persistence/transfer-receipt-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe("V2 transfer receipt discrepancy guard", () => {
    it("does not overwrite a previously recorded discrepancy with a full-quantity receipt", async () => {
        const query = vi.fn(async (sql: string) => {
            if (sql.includes("SELECT stock_request_id AS requestId FROM transfer_receipts")) {
                return [{ requestId: null }];
            }
            if (sql.includes("FROM transfer_receipts WHERE id = ? FOR UPDATE")) {
                return [{ requestId: null, toBranchId: "2", status: "in_transit" }];
            }
            if (sql.includes("FROM transfer_receipt_items")) return [{ id: "10", quantity: 3 }];
            if (sql.includes("FROM transfer_history")) return [{ action: "RECEIPT_RECORDED" }];
            throw new Error(`Unexpected query: ${sql}`);
        });
        const transaction = {};
        const persistence = { sequelize: { query }, inTransaction: (work: (tx: unknown) => Promise<unknown>) =>
            work(transaction) } as unknown as V2Persistence;
        const repository = new SequelizeTransferReceiptV2Repository(persistence);
        expect(await repository.complete(serializeEntityId("1"), serializeEntityId("9"), serializeEntityId("2"),
            [{ itemId: serializeEntityId("10"), receivedQuantity: 3,
            lostQuantity: 0, nonSellableQuantity: 0 }])).toEqual({ kind: "discrepancy_requires_approval" });
        expect(query.mock.calls.some(([sql]) => sql.includes("UPDATE transfer_receipt_items"))).toBe(false);
    });
});
