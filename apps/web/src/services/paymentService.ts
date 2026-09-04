import axios from "../middlewares/axiosConfig";
import type { RequestPayload } from "../types/http";

const creatPayment = (paymentData: RequestPayload) => {
  return axios.post("/create-payment-url", paymentData);
};
const getPaymentReturn = (queryString: string) => {
  return axios.get(`/payment-return?${queryString}`);
};
const getPaymentMethods = () => {
  return axios.get("/payment-methods");
};
export { creatPayment, getPaymentReturn, getPaymentMethods };
