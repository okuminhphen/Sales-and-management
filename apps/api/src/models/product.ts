"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Product extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            //temp

            // define association here
            Product.belongsTo(models.Category, { foreignKey: "categoryId" }); // N - M với User
            Product.belongsToMany(models.Size, {
                through: "ProductSize",
                as: "sizes",
                foreignKey: "productId",
            });
            Product.hasMany(models.ProductSize, {
                foreignKey: "productId",
                as: "productSizes",
            });
            Product.hasMany(models.Review, { foreignKey: "productId" });
        }
    }
    Product.init(
        {
            name: DataTypes.STRING,
            description: DataTypes.STRING,
            price: DataTypes.FLOAT,
            images: DataTypes.JSON,
        },
        {
            sequelize,
            modelName: "Product",
            freezeTableName: true,
        }
    );
    return Product;
};
