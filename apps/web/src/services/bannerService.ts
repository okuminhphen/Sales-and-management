import axios from "../middlewares/axiosConfig";
import type { EntityId, RequestPayload } from "../types/http";

const getActiveBannerService = () => {
  return axios.get("/banner/read");
};
const getActiveBanner = () => {
  return axios.get("/banner/read/active");
};

const createBannerService = (bannerData: RequestPayload) => {
  return axios.post("/banner/create", bannerData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
const updateBannerService = (bannerId: EntityId, bannerData: RequestPayload) => {
  return axios.put(`/banner/update/${bannerId}`, bannerData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
const uploadImages = (formData: FormData) => {
  return axios.post("/upload/images", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
const deleteBanner = (bannerId: EntityId) => {
  return axios.delete(`/banner/delete/${bannerId}`);
};
export {
  getActiveBannerService,
  createBannerService,
  updateBannerService,
  uploadImages,
  deleteBanner,
  getActiveBanner,
};
