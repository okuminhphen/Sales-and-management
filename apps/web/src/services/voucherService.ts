import axios from "../middlewares/axiosConfig";
const getAllVouchers = () => {
  return axios.get(`/voucher/read`);
};
export { getAllVouchers };
