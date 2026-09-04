"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class OrdersDetails extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            OrdersDetails.belongsTo(models.Orders, {
                foreignKey: "orderId",
                as: "ordersDetails",
            });
        }
    }
    OrdersDetails.init(
        {
            orderId: DataTypes.INTEGER,
            productId: DataTypes.INTEGER,
            productName: DataTypes.STRING,
            productImage: DataTypes.STRING,
            productSize: DataTypes.STRING,
            priceAtOrder: DataTypes.FLOAT,
            totalPrice: DataTypes.FLOAT,
            quantity: DataTypes.INTEGER,
        },
        {
            sequelize,
            modelName: "OrdersDetails",
        }
    );
    return OrdersDetails;
};
