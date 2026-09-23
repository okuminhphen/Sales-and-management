import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Sequelize } from "sequelize";
import { env } from "../../src/config/env.js";
import { createV2ModelRegistry } from "../../src/database/v2/persistence.js";
import { runV2Migrations } from "../../src/database/v2/migrate.js";
import {
    createCommercePersistenceModule,
    createPaymentFulfillmentPersistenceModule,
} from "../../src/modules/commerce/persistence/commerce-fulfillment.models.js";

const runDatabaseV2Tests = process.env.RUN_DATABASE_V2_TESTS === "true";

const expectedColumns = {
    Cart: ["id", "customer_id", "created_at", "updated_at"],
    CartItem: ["id", "cart_id", "product_variant_id", "quantity", "created_at", "updated_at"],
    Order: ["id", "code", "checkout_key", "customer_id", "fulfillment_branch_id", "created_by_account_id", "channel", "fulfillment_type", "fulfillment_status", "status", "currency", "subtotal_amount", "discount_amount", "shipping_fee", "total_amount", "customer_name", "customer_email", "customer_phone", "customer_message", "cancelled_at", "cancelled_by_account_id", "cancellation_reason", "fulfilled_at", "placed_at", "created_at", "updated_at"],
    OrderItem: ["id", "order_id", "product_id", "product_variant_id", "sku_snapshot", "product_name_snapshot", "size_name_snapshot", "image_snapshot", "unit_price", "discount_amount", "quantity", "line_total", "created_at"],
    OrderStatusHistory: ["id", "order_id", "from_status", "to_status", "from_fulfillment_status", "to_fulfillment_status", "changed_by_account_id", "note", "changed_at"],
    Voucher: ["id", "code", "description", "discount_type", "discount_value", "min_order_amount", "max_discount_amount", "usage_limit", "per_customer_limit", "applies_to_channel", "branch_scope", "starts_at", "ends_at", "status", "created_at", "updated_at"],
    VoucherBranch: ["voucher_id", "branch_id"],
    VoucherRedemption: ["id", "voucher_id", "order_id", "customer_id", "voucher_code_snapshot", "discount_amount", "status", "reserved_at", "redeemed_at", "released_at"],
    PaymentMethod: ["id", "code", "name", "description", "is_active", "created_at", "updated_at"],
    Payment: ["id", "order_id", "payment_method_id", "collected_by_account_id", "provider", "merchant_reference", "provider_transaction_id", "amount", "status", "paid_at", "created_at", "updated_at"],
    PaymentEvent: ["id", "payment_id", "provider", "event_key", "event_type", "verified_at", "processed_at", "created_at"],
    Shipment: ["id", "order_id", "provider", "provider_request_key", "provider_order_id", "tracking_number", "recipient_name", "recipient_phone", "shipping_address", "province_id", "district_id", "ward_code", "status", "carrier_fee", "cod_amount", "shipped_at", "delivered_at", "returned_at", "created_at", "updated_at"],
    ShipmentEvent: ["id", "shipment_id", "event_key", "status", "occurred_at", "received_at", "processed_at"],
    Return: ["id", "code", "request_key", "order_id", "receiving_branch_id", "created_by_account_id", "approved_by_account_id", "processed_by_account_id", "status", "reason", "approved_at", "received_at", "inspected_at", "completed_at", "created_at", "updated_at"],
    ReturnItem: ["id", "return_id", "order_item_id", "requested_quantity", "approved_quantity", "received_quantity", "restocked_quantity", "non_sellable_quantity", "approved_refund_amount", "note", "created_at", "updated_at"],
    Refund: ["id", "payment_id", "return_id", "idempotency_key", "provider_refund_id", "amount", "status", "reason", "requested_by_account_id", "approved_by_account_id", "processed_by_account_id", "completed_at", "created_at", "updated_at"],
} as const;

describe.skipIf(!runDatabaseV2Tests)("Database V2 commerce and fulfillment typed models on MySQL", () => {
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

    it("maps each commerce and fulfillment model to its complete V2 table", async () => {
        const modules = [
            createCommercePersistenceModule(sequelize),
            createPaymentFulfillmentPersistenceModule(sequelize),
        ];
        expect(() => createV2ModelRegistry(modules)).not.toThrow();
        const definitions = modules.flatMap(({ models }) => models);
        expect(definitions.map(({ name }) => name).sort()).toEqual(Object.keys(expectedColumns).sort());

        for (const { name, model } of definitions) {
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
