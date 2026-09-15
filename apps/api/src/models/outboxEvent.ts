import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class OutboxEvent extends Model {}

    OutboxEvent.init(
        {
            id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
            eventId: { type: DataTypes.UUID, allowNull: false, unique: true },
            eventType: { type: DataTypes.STRING(100), allowNull: false },
            aggregateType: { type: DataTypes.STRING(100), allowNull: false },
            aggregateId: { type: DataTypes.STRING(64), allowNull: false },
            payload: { type: DataTypes.JSON, allowNull: false },
            occurredAt: { type: DataTypes.DATE, allowNull: false },
            publishedAt: { type: DataTypes.DATE, allowNull: true },
            attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
            lockedAt: { type: DataTypes.DATE, allowNull: true },
            lastError: { type: DataTypes.TEXT, allowNull: true },
        },
        { sequelize, modelName: "OutboxEvent", tableName: "OutboxEvent" }
    );

    return OutboxEvent;
};
