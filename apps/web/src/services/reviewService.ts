import axios from "../middlewares/axiosConfig"; // Import axios đã cấu hình
import type { EntityId, RequestPayload } from "../types/http";

const addReview = (reviewData: RequestPayload) => {
  return axios.post("/review/add", reviewData);
};
const getReviewsByProductId = (productId: EntityId) => {
  return axios.get(`/review/product/${productId}`);
};
const getReviewsByUserId = (userId: EntityId) => {
  return axios.get(`/review/user/${userId}`);
};

export { addReview, getReviewsByProductId, getReviewsByUserId };
