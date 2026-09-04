import axios from "../middlewares/axiosConfig";
import type { ApiEnvelope, EntityId } from "../types/http";
import type { BranchDto, BranchInput } from "../types/organization";

const getAllBranches = () => {
  return axios.get<ApiEnvelope<BranchDto[]>>("/branch/read");
};

const createBranch = (branchData: BranchInput) => {
  return axios.post<ApiEnvelope<BranchDto>>("/branch/create", branchData);
};

const updateBranch = (branchId: EntityId, branchData: BranchInput) => {
  return axios.put<ApiEnvelope<BranchDto>>(`/branch/update/${branchId}`, branchData);
};

const deleteBranch = (branchId: EntityId) => {
  return axios.delete<ApiEnvelope<null>>(`/branch/delete/${branchId}`);
};

const getBranchById = (branchId: EntityId) => {
  return axios.get<ApiEnvelope<BranchDto>>(`/branch/${branchId}`);
};

export {
  getAllBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  getBranchById,
};
