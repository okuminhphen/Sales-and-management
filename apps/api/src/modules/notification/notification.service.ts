import db from "../../models/index.js";

const createNotification = async ({ userId, title, content, type }) => {
    try {
        await db.Notification.create({
            userId,
            title,
            content,
            type,
        });

        return {
            EM: "Tạo notification thành công",
            EC: 0,
            DT: "",
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Không thể tạo notification",
            EC: 1,
            DT: "",
        };
    }
};

const getMyNotifications = async (userId) => {
    try {
        let notifications = await db.Notification.findAll({
            where: { userId },
            order: [["createdAt", "DESC"]],
        });

        return {
            EM: "Lấy danh sách notification thành công",
            EC: 0,
            DT: notifications,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Không thể lấy notification",
            EC: 1,
            DT: [],
        };
    }
};

const markAsRead = async (notificationId, userId) => {
    try {
        const notification = await db.Notification.findOne({
            where: {
                id: notificationId,
                userId,
            },
        });

        if (!notification) {
            return {
                EM: "Notification không tồn tại",
                EC: 1,
                DT: "",
            };
        }

        await notification.update({ isRead: true });

        return {
            EM: "Đánh dấu đã đọc thành công",
            EC: 0,
            DT: "",
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Không thể cập nhật notification",
            EC: 1,
            DT: "",
        };
    }
};

const countUnread = async (userId) => {
    try {
        const count = await db.Notification.count({
            where: {
                userId,
                isRead: false,
            },
        });

        return {
            EM: "Lấy số notification chưa đọc thành công",
            EC: 0,
            DT: count,
        };
    } catch (e) {
        console.log(e);
        return {
            EM: "Không thể lấy số notification chưa đọc",
            EC: 1,
            DT: 0,
        };
    }
};

export default {
    createNotification,
    getMyNotifications,
    markAsRead,
    countUnread,
};
