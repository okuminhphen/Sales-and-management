"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class StockRequest extends Model {
        static associate(models) {
            // Chi nhánh gửi yêu cầu
            StockRequest.belongsTo(models.Branch, {
                foreignKey: "fromBranchId",
                as: "fromBranch",
            });

            // Nơi nhận yêu cầu (kho tổng)
            StockRequest.belongsTo(models.Branch, {
                foreignKey: "toBranchId",
                as: "toBranch",
            });

            // Admin tạo request
            StockRequest.belongsTo(models.Admin, {
                foreignKey: "createdBy",
                as: "createdByUser",
            });

            // Admin duyệt request
            StockRequest.belongsTo(models.Admin, {
                foreignKey: "approvedBy",
                as: "approvedByUser",
            });

            StockRequest.hasMany(models.StockRequestItem, {
                foreignKey: "stockRequestId",
                as: "items",
            });

            StockRequest.hasMany(models.StockHistory, {
                foreignKey: "stockRequestId",
                as: "histories",
            });
        }
    }

    StockRequest.init(
        {
            code: {
                type: DataTypes.STRING,
                unique: true,
                allowNull: true, // ✔ cho phép null lúc insert
            },
            fromBranchId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            toBranchId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            status: {
                type: DataTypes.STRING,
                defaultValue: "pending",
            },
            createdBy: DataTypes.INTEGER,
            approvedBy: DataTypes.INTEGER,
        },
        {
            sequelize,
            modelName: "StockRequest",
            tableName: "StockRequests",
            // ❌ KHÔNG hooks
        }
    );

    return StockRequest;
};
