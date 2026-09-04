import db from "../../models/index.js";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import { sendEmailTemplate } from "../../infrastructure/mail/email.service.js";
const salt = bcrypt.genSaltSync(10);
const hashUserPassword = (userPassword) => {
    let hashPassword = bcrypt.hashSync(userPassword, salt);
    return hashPassword;
};

//check email/phone are exist?
const checkEmailExist = async (userEmail) => {
    let user = await db.User.findOne({ where: { email: userEmail } });
    if (user) {
        return true;
    }

    return false;
};

const registerNewUser = async (rawUserData) => {
    try {
        let isEmailExist = await checkEmailExist(rawUserData.email);
        console.log(">>> check email: ", isEmailExist);
        if (isEmailExist === true) {
            return {
                EM: "The email is already exist",
                EC: 1,
            };
        }
        // hash password
        let hashPassword = hashUserPassword(rawUserData.password);

        let customerRole = await db.Role.findOne({
            where: { name: "customer" },
        });
        if (!customerRole) {
            return { EM: "Role 'customer' not found", EC: 1, DT: [] };
        }

        // create  new user
        let newUser = await db.User.create({
            email: rawUserData.email,
            phone: rawUserData.phone,
            username: rawUserData.username,
            password: hashPassword,
        });
        if (!newUser) {
            return {
                EM: "failed to create user",
                EC: -1,
            };
        }

        await db.UserRole.create({
            userId: newUser.id,
            roleId: customerRole.id,
        });
        await sendEmailTemplate(
            newUser.email,
            "Tài khoản mới",
            "newCus",
            {
                fullname: newUser.fullname,
                email: newUser.email,
                username: newUser.username,
                password: rawUserData.password,
            },
            "user"
        );
        return {
            EM: "A user is created  successfully",
            EC: 0,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something wrongs in service...",
            EC: -2,
        };
    }
};

const checkPassword = (inputPassword, hashPassword) => {
    return bcrypt.compareSync(inputPassword, hashPassword); // true or false
};

const handleUserLogin = async (rawUserData) => {
    try {
        let user = await db.User.findOne({
            where: {
                [Op.or]: [
                    { email: rawUserData.emailOrPhone },
                    { phone: rawUserData.emailOrPhone },
                ],
            },
            include: [
                {
                    model: db.Role, // Lấy thông tin từ bảng Role
                    through: { attributes: [] },
                    as: "userRole",
                    attributes: ["id", "name"], // Chỉ lấy id và tên của role
                },
            ],
        });

        if (!user) {
            return {
                EM: "Your email/phone number or password is incorrect",
                EC: 1,
                DT: "",
            };
        }

        // Kiểm tra mật khẩu
        if (!checkPassword(rawUserData.password, user.password)) {
            return {
                EM: "Your email/phone number or password is incorrect",
                EC: 1,
                DT: "",
            };
        }
        let role = user.userRole.length > 0 ? user.userRole[0] : null;
        return {
            EM: "Login success",
            EC: 0,
            DT: {
                userId: user.id,
                email: user.email,
                userRole: role,
                branchId: user.branchId,
            },
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something wrongs in service...",
            EC: -2,
        };
    }
};
const handleGoogleLoginOrRegister = async (rawUserData) => {
    try {
        const { id, email, name, given_name } = rawUserData;
        let user = await db.User.findOne({
            where: { email: email },
            include: [
                {
                    model: db.Role,
                    through: { attributes: [] },
                    as: "userRole",
                    attributes: ["id", "name"],
                },
            ],
        });

        if (!user) {
            user = await db.User.create({
                email: email,
                username: given_name,
                fullname: name,
                googleId: id,
            });
            await db.UserRole.create({
                userId: user.id,
                roleId: 1,
            });

            await sendEmailTemplate(
                user.email,
                "Tài khoản Google mới",
                "newCus",
                {
                    fullname: name,
                    email: user.email,
                    username: given_name,
                    password: "Đăng nhập bằng Google", // không gửi password
                },
                "user"
            );
            user = await db.User.findOne({
                where: { id: user.id },
                include: [
                    {
                        model: db.Role,
                        through: { attributes: [] },
                        as: "userRole",
                        attributes: ["id", "name"],
                    },
                ],
            });
        }

        return {
            EM: "Login success",
            EC: 0,
            DT: {
                userId: user.id,
                email: user.email,
                userRole: user.userRole,
                branchId: user.branchId,
            },
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Something wrongs in service...",
            EC: -2,
        };
    }
};
export default {
    registerNewUser,
    handleUserLogin,
    handleGoogleLoginOrRegister,
};
