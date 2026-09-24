import { describe, expect, it, vi } from "vitest";
import type { Transaction } from "sequelize";
import type { V2Persistence } from "../../src/database/v2/persistence.js";
import { SequelizeInventoryTransferDispatchV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-transfer-dispatch-v2.repository.js";
import { SequelizeInventoryTransferReceiptV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-transfer-receipt-v2.repository.js";
import { SequelizeInventoryReturnRestockV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-return-restock-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

describe("V2 movement transaction error boundary", () => {
    const duplicate = { parent: { code: "ER_DUP_ENTRY" } };
    const cases = [
        {
            name: "transfer dispatch",
            create: (persistence: V2Persistence, transaction?: Transaction) =>
                new SequelizeInventoryTransferDispatchV2Repository(persistence, transaction)
                    .dispatchTransferItem(serializeEntityId("1"), "dispatch-key", serializeEntityId("1")),
        },
        {
            name: "transfer receipt",
            create: (persistence: V2Persistence, transaction?: Transaction) =>
                new SequelizeInventoryTransferReceiptV2Repository(persistence, transaction)
                    .receiveTransferItem(serializeEntityId("1"), "receive-key", serializeEntityId("1")),
        },
        {
            name: "return restock",
            create: (persistence: V2Persistence, transaction?: Transaction) =>
                new SequelizeInventoryReturnRestockV2Repository(persistence, transaction)
                    .restockReturnItem(serializeEntityId("1"), "restock-key", serializeEntityId("1")),
        },
    ];

    for (const { name, create } of cases) {
        it(`${name} propagates a duplicate write error to the caller-owned transaction`, async () => {
            const persistence = { sequelize: { query: vi.fn().mockRejectedValue(duplicate) } } as unknown as V2Persistence;
            await expect(create(persistence, {} as Transaction)).rejects.toBe(duplicate);
        });

        it(`${name} converts a duplicate only after its own transaction rolls back`, async () => {
            const persistence = { inTransaction: vi.fn().mockRejectedValue(duplicate) } as unknown as V2Persistence;
            await expect(create(persistence)).resolves.toEqual({ kind: "idempotency_conflict" });
        });
    }
});
