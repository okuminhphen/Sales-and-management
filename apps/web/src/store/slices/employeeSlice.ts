import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import {
  fetchEmployeesByBranchId,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../../services/employeeService";
import type { ApiEnvelope } from "../../types/http";
import type { EmployeeDto, EmployeeInput } from "../../types/organization";

type RequestStatus = "idle" | "loading" | "succeeded" | "failed";

interface EmployeeState {
  employees: EmployeeDto[];
  status: RequestStatus;
  error: string | null;
}

interface UpdateEmployeeInput {
  employeeId: number;
  updatedData: EmployeeInput;
}

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (!isAxiosError<ApiEnvelope<unknown>>(error)) return fallback;
  return error.response?.data?.EM || fallback;
};

export const fetchEmployeesByBranchThunk = createAsyncThunk<
  EmployeeDto[],
  number,
  { rejectValue: string }
>(
  "employee/fetchEmployeesByBranch",
  async (branchId, { rejectWithValue }) => {
    try {
      const response = await fetchEmployeesByBranchId(branchId);

      if (+response.data.EC !== 0) {
        return rejectWithValue(response.data.EM);
      }

      return response.data.DT;
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi lấy danh sách nhân viên!"));
    }
  }
);

// 📌 Create employee
export const createEmployeeThunk = createAsyncThunk<
  EmployeeDto,
  EmployeeInput,
  { rejectValue: string }
>(
  "employee/createEmployee",
  async (employeeData, { rejectWithValue }) => {
    try {
      const response = await createEmployee(employeeData);

      if (Number(response.data.EC) !== 0) {
        return rejectWithValue(response.data.EM);
      }

      return response.data.DT;
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi tạo employee!"));
    }
  }
);

// 📌 Update employee
export const updateEmployeeThunk = createAsyncThunk<
  EmployeeDto,
  UpdateEmployeeInput,
  { rejectValue: string }
>(
  "employee/updateEmployee",
  async ({ employeeId, updatedData }, { rejectWithValue }) => {
    try {
      const response = await updateEmployee(employeeId, updatedData);

      if (Number(response.data.EC) === 0) {
        return response.data.DT;
      } else {
        return rejectWithValue(
          response.data?.EM || "Không thể cập nhật employee!"
        );
      }
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi cập nhật employee!"));
    }
  }
);

// 📌 Delete employee
export const deleteEmployeeThunk = createAsyncThunk<
  number,
  number,
  { rejectValue: string }
>(
  "employee/deleteEmployee",
  async (employeeId, { rejectWithValue }) => {
    try {
      const response = await deleteEmployee(employeeId);

      if (Number(response.data.EC) === 0) {
        return employeeId;
      } else {
        return rejectWithValue(response.data?.EM || "Không thể xóa employee!");
      }
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi xóa employee!"));
    }
  }
);

const initialState: EmployeeState = {
  employees: [],
  status: "idle",
  error: null,
};

const employeeSlice = createSlice({
  name: "employees",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      // 📌 Fetch employee
      .addCase(fetchEmployeesByBranchThunk.pending, (state) => {
        state.status = "loading";
      })
      .addCase(fetchEmployeesByBranchThunk.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.employees = action.payload;
      })
      .addCase(fetchEmployeesByBranchThunk.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.payload ?? "Không thể tải danh sách nhân viên";
      })

      // 📌 Create employee
      .addCase(createEmployeeThunk.fulfilled, (state, action) => {
        state.employees.push(action.payload);
      })
      .addCase(createEmployeeThunk.rejected, (state, action) => {
        state.error = action.payload ?? "Không thể tạo nhân viên";
      })

      // 📌 Update employee
      .addCase(updateEmployeeThunk.fulfilled, (state, action) => {
        const updated = action.payload;
        const index = state.employees.findIndex((emp) => emp.id === updated.id);
        if (index !== -1) {
          state.employees[index] = updated;
        }
      })
      .addCase(updateEmployeeThunk.rejected, (state, action) => {
        state.error = action.payload ?? "Không thể cập nhật nhân viên";
      })

      // 📌 Delete employee
      .addCase(deleteEmployeeThunk.fulfilled, (state, action) => {
        state.employees = state.employees.filter(
          (emp) => emp.id !== action.payload
        );
      })
      .addCase(deleteEmployeeThunk.rejected, (state, action) => {
        state.error = action.payload ?? "Không thể xóa nhân viên";
      });
  },
});

export default employeeSlice.reducer;
