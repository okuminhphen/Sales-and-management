import { describe, expect, it } from "vitest";
import type { Transaction } from "sequelize";
import type { V2Persistence } from "../../src/database/v2/persistence.js";
import { SequelizeInventoryReservationV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-reservation-v2.repository.js";
import { SequelizeInventoryTransferReservationV2Repository } from "../../src/modules/inventory-transfer/persistence/inventory-transfer-reservation-v2.repository.js";
import { serializeEntityId } from "../../src/shared/contracts/database-scalars.js";

const deadlock = () => ({ parent: { code: "ER_LOCK_DEADLOCK" } });

describe("V2 inventory reservation transaction boundary", () => {
    it("retries an entire standalone order transaction after a deadlock", async () => {
        let transactions = 0;
        const persistence = {
            inTransaction: async (work: (transaction: Transaction) => Promise<unknown>) => {
                transactions += 1;
                if (transactions === 1) throw deadlock();
                return work({} as Transaction);
            },
            sequelize: { query: async () => [] },
        } as unknown as V2Persistence;
        const repository = new SequelizeInventoryReservationV2Repository(persistence);
        expect(await repository.reserveOrderItem({ orderItemId: serializeEntityId("1"), idempotencyKey: "key",
            expiresAt: new Date(Date.now() + 60_000) })).toEqual({ kind: "order_item_not_reservable" });
        expect(transactions).toBe(2);
    });

    it("retries an entire standalone transfer transaction after a deadlock", async () => {
        let transactions = 0;
        const persistence = {
            inTransaction: async (work: (transaction: Transaction) => Promise<unknown>) => {
                transactions += 1;
                if (transactions === 1) throw deadlock();
                return work({} as Transaction);
            },
            sequelize: { query: async () => [] },
        } as unknown as V2Persistence;
        const repository = new SequelizeInventoryTransferReservationV2Repository(persistence);
        expect(await repository.reserveTransferItem({ transferItemId: serializeEntityId("1"), idempotencyKey: "key" }))
            .toEqual({ kind: "transfer_item_not_approvable" });
        expect(transactions).toBe(2);
    });
});
