import db from "../../models/index.js";
import bcrypt from "bcryptjs";
const checkPassword = (inputPassword, hashPassword) => {
    return bcrypt.compareSync(inputPassword, hashPassword); // true or false
};
const salt = bcrypt.genSaltSync(10);
const getUserById = async (id) => {
    try {
        const user = await db.User.findByPk(id, {
            attributes: { exclude: ["password"] },
        });

        if (!user) {
            return {
                EM: "User not found",
                EC: 1,
                DT: null,
            };
        }
        return {
            EM: "Get user successfully",
            EC: 0,
            DT: user,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from server",
            EC: 1,
            DT: null,
        };
    }
};

const updateUserById = async (id, userData) => {
    try {
        console.log("id", id);
        const user = await db.User.findByPk(id);
        if (!user) {
            return {
                EM: "User not found",
                EC: 1,
                DT: null,
            };
        }
        await user.update(userData);
        const safeUser = user.toJSON();
        delete safeUser.password;
        return {
            EM: "Update user successfully",
            EC: 0,
            DT: safeUser,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from server",
            EC: 1,
            DT: null,
        };
    }
};

const updatePasswordById = async (id, passwordData) => {
    try {
        const user = await db.User.findByPk(parseInt(id));
        if (!user) {
            return {
                EM: "User not found",
                EC: 1,
                DT: null,
            };
        }

        const isCorrectCurrentPassword = checkPassword(
            passwordData.currentPassword,
            user.password
        );
        if (!isCorrectCurrentPassword) {
            return {
                EM: "Current password is incorrect",
                EC: 1,
                DT: null,
            };
        }
        const hashPassword = bcrypt.hashSync(passwordData.newPassword, 10);
        await user.update({ password: hashPassword });
        return {
            EM: "Update password successfully",
            EC: 0,
            DT: null,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from server",
            EC: 1,
            DT: null,
        };
    }
};

const updateUserByAdmin = async (userId, userData) => {
    console.log(userData);

    try {
        const newPassword = userData.password;
        const user = await db.User.findByPk(userId);
        if (!user) {
            return {
                EM: "User not found",
                EC: 1,
                DT: null,
            };
        }

        // Cập nhật thông tin cơ bản
        await user.update({
            username: userData.username,
            email: userData.email,
            phone: userData.phone,
        });
        if (newPassword !== "") {
            const hashPassword = bcrypt.hashSync(newPassword, 10);
            await user.update({ password: hashPassword });
        }

        if (userData.roleId) {
            // Kiểm tra xem đã có entry trong bảng trung gian chưa
            const userRole = await db.UserRole.findOne({
                where: { userId },
            });
            if (userRole) {
                // Nếu đã có thì update roleId
                await db.UserRole.update(
                    { roleId: userData.roleId },
                    { where: { userId } }
                );
            } else {
                // Nếu chưa có thì tạo mới
                await db.UserRole.create({
                    userId,
                    roleId: userData.roleId,
                });
            }
        }
        return {
            EM: "Update user successfully",
            EC: 0,
            DT: null,
        };
    } catch (error) {
        console.log("Error in updateUserByAdmin:", error);
        return {
            EM: "Error from server",
            EC: 1,
            DT: null,
        };
    }
};

const deleteUser = async (id) => {
    try {
        const user = await db.User.findByPk(id);
        if (!user) {
            return {
                EM: "User not found",
                EC: 1,
                DT: null,
            };
        }
        await db.UserRole.destroy({
            where: { userId: id },
        });
        await user.destroy();
        return {
            EM: "Delete user successfully",
            EC: 0,
            DT: null,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from server",
            EC: 1,
            DT: null,
        };
    }
};
const getAllUsers = async () => {
    try {
        const users = await db.User.findAll({
            include: [
                {
                    model: db.Role,
                    attributes: ["id", "name"],
                    through: { attributes: [] }, // không lấy dữ liệu từ bảng trung gian
                    as: "userRole",
                },
            ],
        });

        const formattedUsers = users.map((user) => ({
            id: user.id,
            username: user.username,
            email: user.email,
            phone: user.phone,
            roles:
                user.userRole?.map((role) => ({
                    id: role.id,
                    name: role.name,
                })) || [],
        }));
        return {
            EM: "Get all users successfully",
            EC: 0,
            DT: formattedUsers,
        };
    } catch (error) {
        console.log(error);
        return {
            EM: "Error from server",
            EC: 1,
            DT: null,
        };
    }
};
const getUsersWithPagination = async (page, limit) => {
    try {
        const safePage = Math.max(1, page);
        const safeLimit = Math.min(100, Math.max(1, limit));
        const { rows, count } = await db.User.findAndCountAll({
            include: [
                {
                    model: db.Role,
                    attributes: ["id", "name"],
                    through: { attributes: [] },
                    as: "userRole",
                },
            ],
            limit: safeLimit,
            offset: (safePage - 1) * safeLimit,
            distinct: true,
            order: [["id", "DESC"]],
        });
        return {
            EM: "Get users successfully",
            EC: 0,
            DT: { rows, totalItems: count, totalPages: Math.ceil(count / safeLimit), page: safePage },
        };
    } catch (error) {
        console.error(error);
        return { EM: "Error from server", EC: 1, DT: null };
    }
};
const createNewUser = async (userData) => {
    try {
        // 1. Kiểm tra email/phone có tồn tại chưa
        const existingUser = await db.User.findOne({
            where: {
                [db.Sequelize.Op.or]: [
                    { email: userData.email },
                    { phone: userData.phone },
                ],
            },
        });
        const hashedPassword = bcrypt.hashSync(userData.password, salt);

        if (existingUser) {
            return {
                EC: 1,
                EM: "Email hoặc số điện thoại đã tồn tại",
                DT: null,
            };
        }
        const newUser = await db.User.create({
            username: userData.username,
            email: userData.email,
            phone: userData.phone,
            password: hashedPassword,
        });

        // 4. Gán role (UserRole)
        await db.UserRole.create({
            userId: newUser.id,
            roleId: userData.roleId,
        });

        return {
            EC: 0,
            EM: "Tạo người dùng thành công",
            DT: {
                id: newUser.id,
                username: newUser.username,
                email: newUser.email,
                phone: newUser.phone,
            },
        };
    } catch (error) {
        console.log("Lỗi tạo người dùng: ", error);
        return {
            EC: -1,
            EM: "Lỗi server khi tạo người dùng",
            DT: null,
        };
    }
};
export default {
    getUserById,
    updateUserById,
    updatePasswordById,
    deleteUser,
    getAllUsers,
    getUsersWithPagination,
    createNewUser,
    updateUserByAdmin,
};
