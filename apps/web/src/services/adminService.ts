import axios from "../middlewares/axiosConfig";
import type { AdminAccountDto, AdminAccountInput } from "../types/auth";
import type { ApiEnvelope, EntityId } from "../types/http";

export const getAdminAccounts = () =>
  axios.get<ApiEnvelope<AdminAccountDto[]>>("/admin/read");

export const getAdminById = (adminId: EntityId) =>
  axios.get<ApiEnvelope<AdminAccountDto>>(`/admin/${adminId}`);

export const createAdminAccount = (payload: AdminAccountInput) =>
  axios.post<ApiEnvelope<AdminAccountDto>>("/admin/create", payload);

export const updateAdminAccount = (adminId: EntityId, payload: AdminAccountInput) =>
  axios.put<ApiEnvelope<AdminAccountDto>>(`/admin/update/${adminId}`, payload);

export const deleteAdminAccount = (adminId: EntityId) =>
  axios.delete<ApiEnvelope<null>>(`/admin/delete/${adminId}`);
