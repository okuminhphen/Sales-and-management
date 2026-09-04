"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Size extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            //temp

            // define association here
            Size.belongsToMany(models.Product, {
                through: "ProductSize",
                as: "products",
                foreignKey: "sizeId",
            }); // N - M với User
            Size.hasMany(models.ProductSize, { foreignKey: "sizeId" });
        }
    }
    Size.init(
        {
            name: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "Size",
            freezeTableName: true,
        }
    );
    return Size;
};
