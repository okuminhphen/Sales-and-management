"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Admin extends Model {
        static associate(models) {
            // 1 Admin có 1 Role
            Admin.belongsTo(models.Role, {
                foreignKey: "roleId",
                as: "role",
            });
            Admin.hasMany(models.Employee, {
                foreignKey: "adminId",
                as: "managedEmployees",
            });

            // Ví dụ quan hệ mở rộng: nếu muốn Admin quản lý nhiều Branch
            // Admin.hasMany(models.Branch, { foreignKey: "adminId", as: "branches" });
        }
    }

    Admin.init(
        {
            email: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            username: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true,
            },
            password: {
                type: DataTypes.STRING,
                allowNull: false,
            },
            fullname: DataTypes.STRING,
            phone: DataTypes.STRING,
            status: {
                type: DataTypes.ENUM("ACTIVE", "INACTIVE"),
                defaultValue: "ACTIVE",
            },
            roleId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: "Role",
                    key: "id",
                },
            },
            branchId: {
                type: DataTypes.INTEGER,
                allowNull: true,
                references: {
                    model: "Branch",
                    key: "id",
                },
            },
        },
        {
            sequelize,
            modelName: "Admin",
            tableName: "Admins",
        }
    );

    return Admin;
};
