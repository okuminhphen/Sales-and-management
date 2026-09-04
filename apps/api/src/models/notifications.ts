"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Notification extends Model {
        static associate(models) {
            // Notification thuộc về 1 User / Admin / Employee (tùy hệ bạn dùng)
            Notification.belongsTo(models.Admin, {
                foreignKey: "userId",
                as: "admin",
            });

            // Nếu bạn dùng Employee thay vì Admin thì đổi sang:
            // Notification.belongsTo(models.Employee, { foreignKey: "userId", as: "user" });
        }
    }

    Notification.init(
        {
            title: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            content: {
                type: DataTypes.STRING,
                allowNull: false,
            },

            type: {
                type: DataTypes.ENUM(
                    "ORDER_NEW",
                    "LOW_STOCK",
                    "STOCK_REQUEST",
                    "TRANSFER_RECEIPT"
                ),
                allowNull: false,
            },

            isRead: {
                field: "is_read",
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },

            userId: {
                field: "user_id",
                type: DataTypes.INTEGER,
                allowNull: false,
            },

            createdAt: {
                field: "created_at",
                type: DataTypes.DATE,
            },
        },
        {
            sequelize,
            modelName: "Notification",
            tableName: "notifications",
            timestamps: false, // vì bạn dùng created_at thủ công
        }
    );

    return Notification;
};
