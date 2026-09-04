import axios from "../middlewares/axiosConfig";
const sendMessage = (message: string) => {
  return axios.post("/bot/chat", { message });
};
export { sendMessage };
