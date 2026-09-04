import axios from "../middlewares/axiosConfig"; // Import axios đã cấu hình
import type {
  CreateUserInput,
  UpdatePasswordInput,
  UpdateProfileInput,
  UpdateUserByAdminInput,
  UserDto,
  UserSession,
} from "../types/auth";
import type { ApiEnvelope, EntityId } from "../types/http";

const registerNewUser = (
  email: string,
  phone: string,
  username: string,
  password: string,
) => {
  return axios.post<ApiEnvelope<UserSession>>("/register", {
    email,
    phone,
    username,
    password,
  });
};

const loginUser = (emailOrPhone: string, password: string) => {
  return axios.post<ApiEnvelope<UserSession>>("/login", { emailOrPhone, password });
};

const logoutUser = () => {
  return axios.post("/logout");
};

const fetchAllUsers = () => {
  return axios.get<ApiEnvelope<UserDto[]>>(`/user/read`);
};

const createUser = (userData: CreateUserInput) => {
  return axios.post<ApiEnvelope<UserDto>>("/user/create", userData);
};

const deleteUser = (userId: EntityId) => {
  return axios.delete<ApiEnvelope<null>>(`/user/delete/${userId}`);
};

const updateUserByAdmin = (userId: EntityId, userData: UpdateUserByAdminInput) => {
  return axios.put<ApiEnvelope<null>>(`/admin/user/update/${userId}`, userData);
};
const getUserById = (userId: EntityId) => {
  return axios.get<ApiEnvelope<UserDto>>(`/user/${userId}`);
};
const updateUserById = (userId: EntityId, userData: UpdateProfileInput) => {
  return axios.put<ApiEnvelope<UserDto>>(`/user/update/${userId}`, userData);
};
const updatePasswordById = (userId: EntityId, passwordData: UpdatePasswordInput) => {
  return axios.put<ApiEnvelope<null>>(`/user/update-password/${userId}`, passwordData);
};
export {
  registerNewUser,
  loginUser,
  fetchAllUsers,
  deleteUser,
  logoutUser,
  getUserById,
  updateUserById,
  updatePasswordById,
  updateUserByAdmin,
  createUser,
};
