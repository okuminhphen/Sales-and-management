"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class StockRequestItem extends Model {
        static associate(models) {
            StockRequestItem.belongsTo(models.StockRequest, {
                foreignKey: "stockRequestId",
                as: "request",
            });

            StockRequestItem.belongsTo(models.ProductSize, {
                foreignKey: "productSizeId",
                as: "productSize",
            });
        }
    }

    StockRequestItem.init(
        {
            stockRequestId: DataTypes.INTEGER,
            productSizeId: DataTypes.INTEGER,
            quantity: DataTypes.INTEGER,
            note: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "StockRequestItem",
            tableName: "StockRequestItems",
        }
    );

    return StockRequestItem;
};
