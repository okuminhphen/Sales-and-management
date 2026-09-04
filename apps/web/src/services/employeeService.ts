import axios from "../middlewares/axiosConfig";
import type { ApiEnvelope, EntityId } from "../types/http";
import type { EmployeeDto, EmployeeInput } from "../types/organization";

const fetchEmployeesByBranchId = (branchId: EntityId) => {
  return axios.get<ApiEnvelope<EmployeeDto[]>>(`/employee/read/${branchId}`);
};

const createEmployee = (employee: EmployeeInput) => {
  return axios.post<ApiEnvelope<EmployeeDto>>("/employee/create", employee);
};

const updateEmployee = (employeeId: EntityId, employee: EmployeeInput) => {
  return axios.put<ApiEnvelope<EmployeeDto>>(`/employee/update/${employeeId}`, employee);
};

const deleteEmployee = (employeeId: EntityId) => {
  return axios.delete<ApiEnvelope<null>>(`/employee/delete/${employeeId}`);
};

export {
  fetchEmployeesByBranchId,
  createEmployee,
  updateEmployee,
  deleteEmployee,
};
