import notificationService from "./notification.service.js";

const getMyNotificationsFunc = async (req, res) => {
    try {
        const userId = req.user.id;

        let data = await notificationService.getMyNotifications(userId);

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const markAsReadFunc = async (req, res) => {
    try {
        const userId = req.user.id;
        const notificationId = req.params.id;

        let data = await notificationService.markAsRead(notificationId, userId);

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

const countUnreadFunc = async (req, res) => {
    try {
        const userId = req.user.id;

        let data = await notificationService.countUnread(userId);

        return res.status(200).json({
            EM: data.EM,
            EC: data.EC,
            DT: data.DT,
        });
    } catch (e) {
        console.log(e);
        return res.status(500).json({
            EM: "error from server",
            EC: 0,
        });
    }
};

export default {
    getMyNotificationsFunc,
    markAsReadFunc,
    countUnreadFunc,
};
