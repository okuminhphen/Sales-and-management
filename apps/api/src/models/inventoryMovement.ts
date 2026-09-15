import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class InventoryMovement extends Model {}

    InventoryMovement.init(
        {
            id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
            branchId: { type: DataTypes.INTEGER, allowNull: false },
            productSizeId: { type: DataTypes.INTEGER, allowNull: false },
            quantityDelta: { type: DataTypes.INTEGER, allowNull: false },
            balanceAfter: { type: DataTypes.INTEGER, allowNull: false },
            reason: { type: DataTypes.STRING(50), allowNull: false },
            referenceType: { type: DataTypes.STRING(50), allowNull: false },
            referenceId: { type: DataTypes.STRING(64), allowNull: false },
            idempotencyKey: { type: DataTypes.STRING(191), allowNull: false, unique: true },
            createdBy: { type: DataTypes.INTEGER, allowNull: true },
            occurredAt: { type: DataTypes.DATE, allowNull: false },
        },
        { sequelize, modelName: "InventoryMovement", tableName: "InventoryMovement", updatedAt: false }
    );

    return InventoryMovement;
};
