import axios from "../middlewares/axiosConfig";
import type { ApiEnvelope, EntityId } from "../types/http";

const getInventoryByBranch = (branchId: EntityId) => {
  return axios.get<ApiEnvelope<unknown[]>>(`/inventory/${branchId}`);
};

export { getInventoryByBranch };
