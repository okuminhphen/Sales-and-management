import type { QueryInterface } from "sequelize";

const ownedTables = [
    "shipments",
    "shipment_events",
    "returns",
    "return_items",
    "refunds",
] as const;

const createStatements = [
    `CREATE TABLE \`shipments\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`order_id\` BIGINT NOT NULL,
        \`provider\` VARCHAR(50) NOT NULL,
        \`provider_request_key\` VARCHAR(191) NOT NULL,
        \`provider_order_id\` VARCHAR(191) NULL,
        \`tracking_number\` VARCHAR(191) NULL,
        \`recipient_name\` VARCHAR(255) NOT NULL,
        \`recipient_phone\` VARCHAR(30) NOT NULL,
        \`shipping_address\` VARCHAR(500) NOT NULL,
        \`province_id\` INTEGER NULL,
        \`district_id\` INTEGER NULL,
        \`ward_code\` VARCHAR(50) NULL,
        \`status\` ENUM('pending', 'booked', 'shipping', 'delivered', 'failed', 'returning', 'returned', 'cancelled') NOT NULL DEFAULT 'pending',
        \`carrier_fee\` DECIMAL(19,4) NULL,
        \`cod_amount\` DECIMAL(19,4) NOT NULL DEFAULT 0,
        \`shipped_at\` TIMESTAMP NULL,
        \`delivered_at\` TIMESTAMP NULL,
        \`returned_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_shipments_order\` (\`order_id\`),
        UNIQUE KEY \`uq_shipments_provider_request_key\` (\`provider_request_key\`),
        CONSTRAINT \`uq_shipment_provider_order\` UNIQUE (\`provider\`, \`provider_order_id\`),
        KEY \`idx_shipments_status_updated\` (\`status\`, \`updated_at\`),
        CONSTRAINT \`chk_shipment_carrier_fee\` CHECK (\`carrier_fee\` IS NULL OR \`carrier_fee\` >= 0),
        CONSTRAINT \`chk_shipment_cod_amount\` CHECK (\`cod_amount\` >= 0),
        CONSTRAINT \`chk_shipment_recipient\` CHECK (CHAR_LENGTH(TRIM(\`recipient_name\`)) > 0 AND CHAR_LENGTH(TRIM(\`recipient_phone\`)) > 0 AND CHAR_LENGTH(TRIM(\`shipping_address\`)) > 0),
        CONSTRAINT \`chk_shipment_delivery_time\` CHECK (\`status\` <> 'delivered' OR \`delivered_at\` IS NOT NULL),
        CONSTRAINT \`fk_shipments_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`shipment_events\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`shipment_id\` BIGINT NOT NULL,
        \`event_key\` VARCHAR(191) NOT NULL,
        \`status\` ENUM('pending', 'booked', 'shipping', 'delivered', 'failed', 'returning', 'returned', 'cancelled') NOT NULL,
        \`occurred_at\` TIMESTAMP NOT NULL,
        \`received_at\` TIMESTAMP NOT NULL,
        \`processed_at\` TIMESTAMP NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_shipment_event_key\` UNIQUE (\`shipment_id\`, \`event_key\`),
        KEY \`idx_shipment_events_timeline\` (\`shipment_id\`, \`occurred_at\`),
        CONSTRAINT \`fk_shipment_events_shipment\` FOREIGN KEY (\`shipment_id\`) REFERENCES \`shipments\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`returns\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`code\` VARCHAR(50) NOT NULL,
        \`request_key\` VARCHAR(191) NOT NULL,
        \`order_id\` BIGINT NOT NULL,
        \`receiving_branch_id\` BIGINT NOT NULL,
        \`created_by_account_id\` BIGINT NULL,
        \`approved_by_account_id\` BIGINT NULL,
        \`processed_by_account_id\` BIGINT NULL,
        \`status\` ENUM('requested', 'approved', 'received', 'inspected', 'completed', 'rejected', 'cancelled') NOT NULL DEFAULT 'requested',
        \`reason\` VARCHAR(500) NOT NULL,
        \`approved_at\` TIMESTAMP NULL,
        \`received_at\` TIMESTAMP NULL,
        \`inspected_at\` TIMESTAMP NULL,
        \`completed_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_returns_code\` (\`code\`),
        UNIQUE KEY \`uq_returns_request_key\` (\`request_key\`),
        KEY \`idx_returns_order_status\` (\`order_id\`, \`status\`),
        KEY \`idx_returns_receiving_branch\` (\`receiving_branch_id\`),
        KEY \`idx_returns_created_by\` (\`created_by_account_id\`),
        KEY \`idx_returns_approved_by\` (\`approved_by_account_id\`),
        KEY \`idx_returns_processed_by\` (\`processed_by_account_id\`),
        CONSTRAINT \`fk_returns_order\` FOREIGN KEY (\`order_id\`) REFERENCES \`orders\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_returns_branch\` FOREIGN KEY (\`receiving_branch_id\`) REFERENCES \`branches\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_returns_created_by\` FOREIGN KEY (\`created_by_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_returns_approved_by\` FOREIGN KEY (\`approved_by_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_returns_processed_by\` FOREIGN KEY (\`processed_by_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`return_items\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`return_id\` BIGINT NOT NULL,
        \`order_item_id\` BIGINT NOT NULL,
        \`requested_quantity\` INTEGER NOT NULL,
        \`approved_quantity\` INTEGER NOT NULL DEFAULT 0,
        \`received_quantity\` INTEGER NOT NULL DEFAULT 0,
        \`restocked_quantity\` INTEGER NOT NULL DEFAULT 0,
        \`non_sellable_quantity\` INTEGER NOT NULL DEFAULT 0,
        \`approved_refund_amount\` DECIMAL(19,4) NOT NULL DEFAULT 0,
        \`note\` VARCHAR(500) NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`uq_return_items_return_order_item\` UNIQUE (\`return_id\`, \`order_item_id\`),
        KEY \`idx_return_items_order_item\` (\`order_item_id\`),
        CONSTRAINT \`chk_return_quantities\` CHECK (\`requested_quantity\` > 0 AND \`approved_quantity\` >= 0 AND \`approved_quantity\` <= \`requested_quantity\` AND \`received_quantity\` >= 0 AND \`received_quantity\` <= \`approved_quantity\`),
        CONSTRAINT \`chk_return_disposition\` CHECK (\`restocked_quantity\` >= 0 AND \`non_sellable_quantity\` >= 0 AND \`restocked_quantity\` + \`non_sellable_quantity\` <= \`received_quantity\` AND \`approved_refund_amount\` >= 0),
        CONSTRAINT \`fk_return_items_return\` FOREIGN KEY (\`return_id\`) REFERENCES \`returns\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_return_items_order_item\` FOREIGN KEY (\`order_item_id\`) REFERENCES \`order_items\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE \`refunds\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`payment_id\` BIGINT NOT NULL,
        \`return_id\` BIGINT NULL,
        \`idempotency_key\` VARCHAR(191) NOT NULL,
        \`provider_refund_id\` VARCHAR(191) NULL,
        \`amount\` DECIMAL(19,4) NOT NULL,
        \`status\` ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') NOT NULL DEFAULT 'pending',
        \`reason\` VARCHAR(500) NOT NULL,
        \`requested_by_account_id\` BIGINT NULL,
        \`approved_by_account_id\` BIGINT NULL,
        \`processed_by_account_id\` BIGINT NULL,
        \`completed_at\` TIMESTAMP NULL,
        \`created_at\` TIMESTAMP NOT NULL,
        \`updated_at\` TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_refunds_idempotency_key\` (\`idempotency_key\`),
        CONSTRAINT \`uq_refund_payment_provider_reference\` UNIQUE (\`payment_id\`, \`provider_refund_id\`),
        KEY \`idx_refunds_payment_status\` (\`payment_id\`, \`status\`),
        KEY \`idx_refunds_return\` (\`return_id\`),
        KEY \`idx_refunds_requested_by\` (\`requested_by_account_id\`),
        KEY \`idx_refunds_approved_by\` (\`approved_by_account_id\`),
        KEY \`idx_refunds_processed_by\` (\`processed_by_account_id\`),
        CONSTRAINT \`chk_refund_amount\` CHECK (\`amount\` > 0),
        CONSTRAINT \`chk_refund_completion_time\` CHECK (\`status\` <> 'completed' OR \`completed_at\` IS NOT NULL),
        CONSTRAINT \`fk_refunds_payment\` FOREIGN KEY (\`payment_id\`) REFERENCES \`payments\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_refunds_return\` FOREIGN KEY (\`return_id\`) REFERENCES \`returns\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_refunds_requested_by\` FOREIGN KEY (\`requested_by_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_refunds_approved_by\` FOREIGN KEY (\`approved_by_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_refunds_processed_by\` FOREIGN KEY (\`processed_by_account_id\`) REFERENCES \`accounts\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const migration = {
    up: async (queryInterface: QueryInterface): Promise<void> => {
        const existingTables = new Set(
            (await queryInterface.showAllTables()).map((tableName) => tableName.toLowerCase()),
        );
        const overlappingTables = ownedTables.filter((tableName) => existingTables.has(tableName));

        if (overlappingTables.length > 0) {
            throw new Error(
                `Database V2 fulfillment baseline refuses to run when any owned table already exists: ${overlappingTables.join(", ")}.`,
            );
        }

        for (const statement of createStatements) {
            await queryInterface.sequelize.query(statement);
        }
    },
};

export default migration;
