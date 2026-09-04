"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Inventory extends Model {
        static associate(models) {
            // Mỗi inventory thuộc về 1 chi nhánh
            Inventory.belongsTo(models.Branch, {
                foreignKey: "branchId",
                as: "branch",
            });

            // Mỗi inventory thuộc về 1 product size
            Inventory.belongsTo(models.ProductSize, {
                foreignKey: "productSizeId",
                as: "productSize",
            });
        }
    }

    Inventory.init(
        {
            id: {
                type: DataTypes.INTEGER,
                primaryKey: true,
                autoIncrement: true,
            },
            branchId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            productSizeId: {
                type: DataTypes.INTEGER,
                allowNull: true,
            },
            stock: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
            },
        },
        {
            sequelize,
            modelName: "Inventory",
            tableName: "Inventory",
        }
    );

    return Inventory;
};
