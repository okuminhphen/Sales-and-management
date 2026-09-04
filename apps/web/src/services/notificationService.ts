import axios from "../middlewares/axiosConfig";
import type { EntityId } from "../types/http";

const getMyNotifications = () => {
  return axios.get("/notifications/my");
};

const countUnreadNotifications = () => {
  return axios.get("/notifications/count");
};

const markAsRead = (notificationId: EntityId) => {
  return axios.patch(`/notifications/${notificationId}/read`);
};

const markAllAsRead = () => {
  return axios.patch("/notifications/mark-all-as-read");
};

export default {
  getMyNotifications,
  countUnreadNotifications,
  markAsRead,
  markAllAsRead,
};
