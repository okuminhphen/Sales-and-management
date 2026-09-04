"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class CartProductSize extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            CartProductSize.belongsTo(models.Cart, {
                foreignKey: "cartId",
                targetKey: "id",
            });
            CartProductSize.belongsTo(models.ProductSize, {
                foreignKey: "productSizeId",
                targetKey: "id",
            });
        }
    }
    CartProductSize.init(
        {
            cartId: {
                type: DataTypes.INTEGER,
                references: {
                    model: "Cart",
                    key: "id",
                },
            },
            productSizeId: {
                type: DataTypes.INTEGER,
                references: {
                    model: "ProductSize",
                    key: "id",
                },
            },
            quantity: DataTypes.INTEGER,
        },
        {
            sequelize,
            modelName: "CartProductSize",
            freezeTableName: true,
        }
    );
    return CartProductSize;
};
