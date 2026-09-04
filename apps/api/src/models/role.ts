"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Role extends Model {
        /**
         * Helper method for defining associations.
         * This method is not a part of Sequelize lifecycle.
         * The `models/index` file will call this method automatically.
         */
        static associate(models) {
            // define association here
            Role.belongsToMany(models.User, {
                through: models.UserRole, // Dùng model thay vì string
                foreignKey: "roleId", // Khóa ngoại từ Role -> UserRole
                otherKey: "userId", // Khóa ngoại từ User -> UserRole
                as: "roleUser",
            });
        }
    }
    Role.init(
        {
            description: DataTypes.STRING,
            name: DataTypes.STRING,
        },
        {
            sequelize,
            modelName: "Role",
        }
    );
    return Role;
};

