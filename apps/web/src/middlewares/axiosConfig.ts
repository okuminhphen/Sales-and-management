import axios from "axios";
import { API_BASE_URL } from "../config/constants";

// Next we make an 'instance' of it
const instance = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // Tự động gửi cookies trong mọi request
});

instance.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("adminToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default instance;
