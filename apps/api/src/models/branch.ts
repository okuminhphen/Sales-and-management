"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Branch extends Model {
        declare code: string;
        static associate(models) {
            Branch.hasMany(models.Employee, {
                foreignKey: "branchId",
                as: "employees",
            });

            Branch.hasMany(models.Inventory, {
                foreignKey: "branchId",
                as: "inventory",
                onDelete: "CASCADE", // ⭐ quan trọng
                hooks: true, // ⭐ bắt buộc để Sequelize gọi cascade
            });

            Branch.belongsTo(models.Employee, {
                foreignKey: "managerId",
                as: "manager",
            });

            Branch.hasMany(models.Orders, {
                foreignKey: "branchId",
                as: "orders",
            });
            Branch.hasMany(models.User, {
                foreignKey: "branchId",
                as: "users",
            });
        }
    }

    Branch.init(
        {
            code: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
            },
            name: DataTypes.STRING,
            address: DataTypes.STRING,
            phone: DataTypes.STRING,
            email: DataTypes.STRING,
            type: DataTypes.STRING, // "central" hoặc "branch"
            managerId: DataTypes.INTEGER,
        },
        {
            sequelize,
            modelName: "Branch",
            tableName: "Branch",
            hooks: {
                // Tự động sinh code dạng CH1, CH2...
                async beforeCreate(branch) {
                    const lastBranch = await Branch.findOne({
                        order: [["id", "DESC"]],
                    });

                    let nextNumber = 1;
                    if (lastBranch && lastBranch.code) {
                        const lastNumber = parseInt(
                            lastBranch.code.replace("CH", "")
                        );
                        if (!isNaN(lastNumber)) nextNumber = lastNumber + 1;
                    }

                    branch.code = `CH${nextNumber}`;
                },
            },
        }
    );

    return Branch;
};
