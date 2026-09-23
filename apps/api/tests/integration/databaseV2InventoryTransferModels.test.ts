import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createV2ModelRegistry } from "../../src/database/v2/persistence.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import { createInventoryTransferPersistenceModule } from "../../src/modules/inventory-transfer/persistence/inventory-transfer.models.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

const expectedColumns = {
    Inventory: ["id", "branch_id", "product_variant_id", "stock", "created_at", "updated_at"],
    StockRequest: ["id", "code", "from_branch_id", "to_branch_id", "status", "created_by_account_id", "approved_by_account_id", "approved_at", "created_at", "updated_at"],
    StockRequestItem: ["id", "stock_request_id", "product_variant_id", "quantity", "note", "created_at", "updated_at"],
    StockRequestHistory: ["id", "stock_request_id", "action", "performed_by_account_id", "note", "created_at"],
    TransferReceipt: ["id", "stock_request_id", "code", "from_branch_id", "to_branch_id", "status", "created_by_account_id", "approved_by_account_id", "approved_at", "dispatched_at", "completed_at", "created_at", "updated_at"],
    TransferReceiptItem: ["id", "transfer_receipt_id", "product_variant_id", "quantity", "received_quantity", "lost_quantity", "non_sellable_quantity", "note", "created_at", "updated_at"],
    TransferHistory: ["id", "transfer_receipt_id", "action", "performed_by_account_id", "note", "created_at"],
    InventoryReservation: ["id", "inventory_id", "order_item_id", "transfer_receipt_item_id", "quantity", "status", "expires_at", "confirmed_at", "consumed_at", "released_at", "idempotency_key", "created_at", "updated_at"],
    InventoryMovement: ["id", "branch_id", "product_variant_id", "quantity_delta", "balance_after", "order_item_id", "transfer_receipt_item_id", "return_item_id", "reason", "reference_type", "reference_id", "idempotency_key", "created_by_account_id", "occurred_at", "created_at"],
} as const;

describe.skipIf(!runDatabaseV2Tests)("Database V2 inventory-transfer typed models on MySQL", () => {
    let sequelize: Sequelize;

    beforeAll(async () => {
        if (!env.V2_MIGRATIONS_TARGET_DATABASE?.endsWith("_test")) {
            throw new Error("Database V2 tests require an explicit _test database.");
        }
        await runV2Migrations("up");
        sequelize = new Sequelize(env.V2_MIGRATIONS_TARGET_DATABASE, env.MYSQL_USER, env.MYSQL_PASSWORD, {
            host: env.MYSQL_HOST, port: env.MYSQL_PORT, dialect: "mysql", logging: false,
        });
        await sequelize.authenticate();
    });

    afterAll(async () => sequelize?.close());

    it("maps each inventory-transfer model to its complete V2 table and composes internal associations", async () => {
        const module = createInventoryTransferPersistenceModule(sequelize);
        expect(() => createV2ModelRegistry([module])).not.toThrow();
        expect(module.models.map(({ name }) => name).sort()).toEqual(Object.keys(expectedColumns).sort());

        for (const { name, model } of module.models) {
            const tableName = model.getTableName() as string;
            const fields = Object.entries(model.getAttributes())
                .map(([attributeName, attribute]) => attribute.field ?? attributeName)
                .sort();
            const table = await sequelize.getQueryInterface().describeTable(tableName);
            expect(fields).toEqual([...expectedColumns[name as keyof typeof expectedColumns]].sort());
            expect(Object.keys(table).sort()).toEqual(fields);
        }
    });
});
