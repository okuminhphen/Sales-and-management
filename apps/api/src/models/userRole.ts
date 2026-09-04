"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class UserRole extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            UserRole.belongsTo(models.User, {
                foreignKey: "userId",
            });

            UserRole.belongsTo(models.Role, {
                foreignKey: "roleId",
            });
        }
    }
    UserRole.init(
        {
            userId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "User",
                    key: "id",
                },
            },
            roleId: {
                type: DataTypes.INTEGER,
                allowNull: false,
                references: {
                    model: "Role",
                    key: "id",
                },
            },
        },
        {
            sequelize,
            modelName: "UserRole",
            freezeTableName: true,
        }
    );
    return UserRole;
};

