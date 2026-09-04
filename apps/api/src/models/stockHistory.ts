"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class StockHistory extends Model {
        static associate(models) {
            StockHistory.belongsTo(models.StockRequest, {
                foreignKey: "stockRequestId",
                as: "request",
            });

            StockHistory.belongsTo(models.Admin, {
                foreignKey: "performedBy",
                as: "actor",
            });
        }
    }

    StockHistory.init(
        {
            stockRequestId: DataTypes.INTEGER,
            action: DataTypes.STRING, // REQUESTED / APPROVED / REJECTED / TRANSFERRED / RECEIVED
            performedBy: DataTypes.INTEGER,
            note: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "StockHistory",
            tableName: "StockHistories",
        }
    );

    return StockHistory;
};
