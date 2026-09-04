"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Vouchers extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
        }
    }
    Vouchers.init(
        {
            code: DataTypes.STRING,
            description: DataTypes.STRING,
            discount_type: DataTypes.ENUM("percent", "fixed"),
            discount_value: DataTypes.DECIMAL(10, 2),
            min_order_value: DataTypes.DECIMAL(10, 2),
            quantity: DataTypes.INTEGER,
            expires_at: DataTypes.DATE,
        },
        {
            sequelize,
            modelName: "Vouchers",
            tableName: "Vouchers",
        }
    );
    return Vouchers;
};
