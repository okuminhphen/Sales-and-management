"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class ProductSize extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            ProductSize.belongsTo(models.Product, {
                foreignKey: "productId",
                as: "product",
            });
            ProductSize.belongsTo(models.Size, {
                foreignKey: "sizeId",
                as: "size",
            });

            ProductSize.belongsToMany(models.Cart, {
                through: "CartProductSize",
                foreignKey: "productSizeId",
                otherKey: "cartId", // 👈 Chỉ định khóa ngoại đúng
            });
            ProductSize.hasMany(models.Inventory, {
                foreignKey: "productSizeId",
                as: "inventories",
            });
        }
    }
    ProductSize.init(
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            productId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            sizeId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            stock: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
        },
        {
            sequelize,
            modelName: "ProductSize",
            tableName: "ProductSize",
        }
    );
    return ProductSize;
};
