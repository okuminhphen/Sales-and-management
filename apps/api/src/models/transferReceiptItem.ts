"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class TransferReceiptItem extends Model {
        static associate(models) {
            TransferReceiptItem.belongsTo(models.TransferReceipt, {
                foreignKey: "transferReceiptId",
                as: "receipt",
            });

            TransferReceiptItem.belongsTo(models.ProductSize, {
                foreignKey: "productSizeId",
                as: "productSize",
            });
        }
    }

    TransferReceiptItem.init(
        {
            transferReceiptId: DataTypes.INTEGER,
            productSizeId: DataTypes.INTEGER,
            quantity: DataTypes.INTEGER,
            note: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "TransferReceiptItem",
            tableName: "TransferReceiptItem",
        }
    );

    return TransferReceiptItem;
};
