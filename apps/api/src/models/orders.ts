"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Orders extends Model {
        declare code: string;
        static associate(models) {
            Orders.belongsTo(models.User, { foreignKey: "userId" });
            Orders.belongsTo(models.Branch, {
                foreignKey: "branchId",
                as: "branch",
            });
            Orders.hasOne(models.Payment, {
                foreignKey: "orderId",
                as: "payment",
            });
            Orders.hasMany(models.OrdersDetails, {
                foreignKey: "orderId",
                as: "ordersDetails",
            });
        }
    }

    Orders.init(
        {
            userId: DataTypes.INTEGER,

            branchId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },

            code: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
            },

            orderDate: DataTypes.DATE,
            status: DataTypes.STRING,
            totalPrice: DataTypes.FLOAT,

            // ===== Thông tin khách =====
            customerName: DataTypes.STRING,
            customerEmail: DataTypes.STRING,
            customerPhone: DataTypes.STRING,

            // ===== Địa chỉ chi tiết =====
            shippingAddress: DataTypes.STRING,

            // ===== ĐỊA CHỈ GHN =====
            toProvinceId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            toDistrictId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            toWardCode: {
                type: DataTypes.STRING,
                allowNull: true,
            },

            // ===== GHN =====
            ghnOrderId: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            shippingFee: {
                type: DataTypes.FLOAT,
                defaultValue: 0,
            },

            message: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "Orders",
            tableName: "Orders",
        }
    );

    return Orders;
};
