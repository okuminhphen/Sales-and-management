"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Payment extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            Payment.belongsTo(models.Orders, {
                foreignKey: "orderId",
                as: "payment",
            });
            Payment.belongsTo(models.PaymentMethods, {
                foreignKey: "paymentMethodId",
                as: "paymentMethod",
            });
        }
    }
    Payment.init(
        {
            orderId: DataTypes.INTEGER,
            paymentMethodId: DataTypes.INTEGER,
            amount: DataTypes.FLOAT,
            transactionId: DataTypes.STRING,
            status: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "Payment",
        }
    );
    return Payment;
};
