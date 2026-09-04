"use strict";
import { Model } from "sequelize";

export default (sequelize, DataTypes) => {
    class Employee extends Model {
        declare code: string;
        declare hiredAt: Date;
        static associate(models) {
            Employee.belongsTo(models.Branch, {
                foreignKey: "branchId",
                as: "branch",
            });

            Employee.belongsTo(models.Admin, {
                foreignKey: "adminId",
                as: "admin",
            });

            Employee.hasMany(models.Branch, {
                foreignKey: "managerId",
                as: "managedBranches",
            });
        }
    }

    Employee.init(
        {
            code: {
                type: DataTypes.STRING,
                allowNull: true,
                unique: true,
            },
            adminId: DataTypes.INTEGER,
            branchId: DataTypes.INTEGER,
            name: DataTypes.STRING,
            position: DataTypes.STRING,
            phone: DataTypes.STRING,
            email: DataTypes.STRING,
            salary: DataTypes.DECIMAL,
            status: DataTypes.STRING,
            hiredAt: DataTypes.DATE,
        },
        {
            sequelize,
            modelName: "Employee",
            tableName: "Employee",
            hooks: {
                async beforeCreate(employee) {
                    // Sinh code dạng NV001, NV002...
                    const count = await sequelize.models.Employee.count();
                    employee.code = `NV${String(count + 1).padStart(3, "0")}`;

                    // Auto set ngày làm việc nếu client không gửi
                    if (!employee.hiredAt) {
                        employee.hiredAt = new Date();
                    }
                },
            },
        }
    );

    return Employee;
};
