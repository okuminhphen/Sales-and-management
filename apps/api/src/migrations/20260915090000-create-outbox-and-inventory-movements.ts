"use strict";

/**
 * Add-only migration. It deliberately leaves legacy money columns and historic
 * records untouched; those require a checked production data migration.
 */
export default {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable("OutboxEvent", {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
            eventId: { allowNull: false, type: Sequelize.UUID, unique: true },
            eventType: { allowNull: false, type: Sequelize.STRING(100) },
            aggregateType: { allowNull: false, type: Sequelize.STRING(100) },
            aggregateId: { allowNull: false, type: Sequelize.STRING(64) },
            payload: { allowNull: false, type: Sequelize.JSON },
            occurredAt: { allowNull: false, type: Sequelize.DATE },
            publishedAt: { allowNull: true, type: Sequelize.DATE },
            attempts: { allowNull: false, type: Sequelize.INTEGER, defaultValue: 0 },
            lockedAt: { allowNull: true, type: Sequelize.DATE },
            lastError: { allowNull: true, type: Sequelize.TEXT },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE },
        });
        await queryInterface.addIndex("OutboxEvent", ["publishedAt", "lockedAt", "id"], {
            name: "idx_outbox_dispatch",
        });

        await queryInterface.createTable("InventoryMovement", {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.BIGINT },
            branchId: {
                allowNull: false, type: Sequelize.INTEGER,
                references: { model: "Branch", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT",
            },
            productSizeId: {
                allowNull: false, type: Sequelize.INTEGER,
                references: { model: "ProductSize", key: "id" }, onUpdate: "CASCADE", onDelete: "RESTRICT",
            },
            quantityDelta: { allowNull: false, type: Sequelize.INTEGER },
            balanceAfter: { allowNull: false, type: Sequelize.INTEGER },
            reason: { allowNull: false, type: Sequelize.STRING(50) },
            referenceType: { allowNull: false, type: Sequelize.STRING(50) },
            referenceId: { allowNull: false, type: Sequelize.STRING(64) },
            idempotencyKey: { allowNull: false, type: Sequelize.STRING(191), unique: true },
            createdBy: { allowNull: true, type: Sequelize.INTEGER },
            occurredAt: { allowNull: false, type: Sequelize.DATE },
            createdAt: { allowNull: false, type: Sequelize.DATE },
        });
        await queryInterface.addIndex("InventoryMovement", ["branchId", "productSizeId", "occurredAt"], {
            name: "idx_inventory_movement_ledger",
        });
    },
    async down(queryInterface) {
        await queryInterface.dropTable("InventoryMovement");
        await queryInterface.dropTable("OutboxEvent");
    },
};
