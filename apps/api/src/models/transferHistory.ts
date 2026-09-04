"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class TransferHistory extends Model {
        static associate(models) {
            TransferHistory.belongsTo(models.TransferReceipt, {
                foreignKey: "transferReceiptId",
                as: "receipt",
            });

            TransferHistory.belongsTo(models.Admin, {
                foreignKey: "performedBy",
                as: "actor",
            });
        }
    }

    TransferHistory.init(
        {
            transferReceiptId: DataTypes.INTEGER,
            action: DataTypes.STRING, // created, approved, etc
            performedBy: DataTypes.INTEGER,
            note: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "TransferHistory",
            tableName: "TransferHistory",
        }
    );

    return TransferHistory;
};
