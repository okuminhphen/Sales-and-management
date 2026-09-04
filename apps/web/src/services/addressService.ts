import axios from "../middlewares/axiosConfig";
import type { EntityId } from "../types/http";

export const getProvinces = () => {
  return axios.get("/address/provinces");
};

export const getDistricts = (provinceId: EntityId) => {
  return axios.get("/address/districts", {
    params: { provinceId },
  });
};

export const getWards = (districtId: EntityId) => {
  return axios.get("/address/wards", {
    params: { districtId },
  });
};
