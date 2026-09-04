"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class UserBehavior extends Model {
        static associate(models) {
            // Mỗi hành vi thuộc về 1 user
            UserBehavior.belongsTo(models.User, {
                foreignKey: "userId",
                as: "user",
            });

            // Mỗi hành vi thuộc về 1 sản phẩm
            UserBehavior.belongsTo(models.Product, {
                foreignKey: "productId",
                as: "product",
            });
        }
    }

    UserBehavior.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            productId: {
                type: DataTypes.INTEGER,
                allowNull: false,
            },
            viewCount: {
                type: DataTypes.INTEGER,
                defaultValue: 0,
            },
            isLiked: {
                type: DataTypes.BOOLEAN,
                defaultValue: false,
            },
        },
        {
            sequelize,
            modelName: "UserBehavior",
            tableName: "UserBehavior",
        }
    );

    return UserBehavior;
};
