import axios from "../middlewares/axiosConfig";
import type { EntityId, RequestPayload } from "../types/http";
const getAllRoles = () => {
  return axios.get(`/role/read`);
};

const createRole = (roleData: RequestPayload) => {
  return axios.post(`/role/create`, roleData);
};

const updateRole = (roleId: EntityId, roleData: RequestPayload) => {
  return axios.put(`/role/update/${roleId}`, roleData);
};
const deleteRole = (roleId: EntityId) => {
  return axios.delete(`/role/delete/${roleId}`);
};
export { getAllRoles, createRole, updateRole, deleteRole };
