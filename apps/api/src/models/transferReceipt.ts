"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class TransferReceipt extends Model {
        declare id: number;
        static associate(models) {
            // 1 receipt có nhiều item
            TransferReceipt.hasMany(models.TransferReceiptItem, {
                foreignKey: "transferReceiptId",
                as: "items",
            });

            // 1 receipt có lịch sử thay đổi
            TransferReceipt.hasMany(models.TransferHistory, {
                foreignKey: "transferReceiptId",
                as: "histories",
            });

            // người tạo
            TransferReceipt.belongsTo(models.Admin, {
                foreignKey: "createdBy",
                as: "creator",
            });

            // người duyệt
            TransferReceipt.belongsTo(models.Admin, {
                foreignKey: "approvedBy",
                as: "approver",
            });

            // kho nguồn
            TransferReceipt.belongsTo(models.Branch, {
                foreignKey: "fromBranchId",
                as: "fromBranch",
            });

            // kho đích
            TransferReceipt.belongsTo(models.Branch, {
                foreignKey: "toBranchId",
                as: "toBranch",
            });
        }
    }

    TransferReceipt.init(
        {
            code: {
                type: DataTypes.STRING,
                unique: true,
                allowNull: true,
            },
            fromBranchId: DataTypes.INTEGER,
            toBranchId: DataTypes.INTEGER,
            createdBy: DataTypes.INTEGER,
            approvedBy: DataTypes.INTEGER,
            status: {
                type: DataTypes.ENUM(
                    "pending",
                    "approved",
                    "rejected",
                    "cancelled"
                ),
                defaultValue: "pending",
            },
        },
        {
            sequelize,
            modelName: "TransferReceipt",
            tableName: "TransferReceipt",
            hooks: {
                async afterCreate(receipt, options) {
                    const code = `PX${String(receipt.id).padStart(5, "0")}`;
                    await receipt.update(
                        { code },
                        { transaction: options.transaction }
                    );
                },
            },
        }
    );

    return TransferReceipt;
};
