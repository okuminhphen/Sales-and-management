import axios from "../middlewares/axiosConfig"; // Import axios đã cấu hình
import type { EntityId } from "../types/http";

const addViewAPI = (productId: EntityId) => {
  return axios.post(`/behavior/view/${productId}`);
};

const toggleLikeAPI = (productId: EntityId) => {
  return axios.post(`/behavior/like/${productId}`);
};

const getLikeStatusAPI = (productId: EntityId) => {
  return axios.get(`/behavior/like-status/${productId}`);
};

export { addViewAPI, toggleLikeAPI, getLikeStatusAPI };
