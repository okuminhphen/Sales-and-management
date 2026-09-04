"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class PaymentMethods extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            PaymentMethods.hasMany(models.Payment, {
                foreignKey: "paymentMethodId",
                as: "payment",
            });
        }
    }
    PaymentMethods.init(
        {
            name: DataTypes.STRING,
            description: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "PaymentMethods",
        }
    );
    return PaymentMethods;
};
