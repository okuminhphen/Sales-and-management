import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit";
import { isAxiosError } from "axios";
import {
  loginUser,
  updateUserById,
  updatePasswordById,
  fetchAllUsers,
  deleteUser,
  createUser,
  updateUserByAdmin,
} from "../../services/userService";
import { toast } from "react-toastify";
import type {
  CreateUserInput,
  UpdatePasswordInput,
  UpdateProfileInput,
  UpdateUserByAdminInput,
  UserDto,
  UserSession,
} from "../../types/auth";
import type { ApiEnvelope } from "../../types/http";

interface UserState {
  currentUser: UserSession | null;
  isAuthenticated: boolean;
  users: UserDto[];
  loading: boolean;
  error: string | null;
}

interface LoginInput {
  emailOrPhone: string;
  password: string;
}

interface UpdateUserInput {
  userId: number;
  updatedData: UpdateProfileInput;
}

interface UpdatePasswordCommand {
  userId: number;
  updatedPassword: UpdatePasswordInput;
}

const apiErrorMessage = (error: unknown, fallback: string): string => {
  if (!isAxiosError<ApiEnvelope<unknown>>(error)) return fallback;
  return error.response?.data?.EM || fallback;
};

const readPersistedUser = (): UserSession | null => {
  const value = sessionStorage.getItem("user");
  if (!value) return null;
  try {
    return JSON.parse(value) as UserSession;
  } catch {
    sessionStorage.removeItem("user");
    return null;
  }
};

// Async thunk để lấy danh sách người dùng
export const fetchUsers = createAsyncThunk<UserDto[], void, { rejectValue: string }>(
  "user/fetchUsers",
  async (_, thunkAPI) => {
    try {
      const response = await fetchAllUsers();

      if (+response.data.EC === 0) {
        return response.data.DT;
      } else {
        return thunkAPI.rejectWithValue(response.data.EM);
      }
    } catch {
      return thunkAPI.rejectWithValue("Không thể kết nối đến server");
    }
  }
);

export const createUserThunk = createAsyncThunk<
  UserDto,
  CreateUserInput,
  { rejectValue: string }
>(
  "user/create",
  async (userData, { rejectWithValue }) => {
    try {
      const response = await createUser(userData);
      if (response && response.data && +response.data.EC === 0) {
        toast.success(response.data.EM || "Tạo người dùng thành công");
        return response.data.DT;
      } else {
        toast.error(response.data.EM || "Tạo người dùng thất bại");
        return rejectWithValue(response.data.EM);
      }
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi tạo người dùng"));
    }
  }
);
// Async thunk để đăng nhập người dùng
export const loginByUser = createAsyncThunk<
  UserSession,
  LoginInput,
  { rejectValue: string }
>(
  "user/login",
  async ({ emailOrPhone, password }, { rejectWithValue }) => {
    try {
      let response = await loginUser(emailOrPhone, password);

      // Kiểm tra kết quả phản hồi
      if (response && response.data && +response.data.EC === 0) {
        // Lưu vào sessionStorage nếu cần thiết

        let userData = response.data.DT; // Trả về dữ liệu người dùng
        sessionStorage.setItem("token", userData.token);
        sessionStorage.setItem("role", userData.userRole.name);
        sessionStorage.setItem("userId", JSON.stringify(userData.userId));
        sessionStorage.setItem("user", JSON.stringify(userData));
        return userData;
      } else {
        // Nếu API trả về lỗi
        return rejectWithValue(response.data.EM || "Đăng nhập thất bại");
      }
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi kết nối đến server"));
    }
  }
);
export const updateUserThunk = createAsyncThunk<
  UserDto,
  UpdateUserInput,
  { rejectValue: string }
>(
  "user/update",
  async ({ userId, updatedData }, { rejectWithValue }) => {
    try {
      const response = await updateUserById(userId, updatedData);

      if (response && response.data && +response.data.EC === 0) {
        const updatedUser = response.data.DT;

        return updatedUser;
      } else {
        return rejectWithValue(response.data.EM || "Cập nhật thất bại");
      }
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi cập nhật thông tin"));
    }
  }
);
export const updatePasswordThunk = createAsyncThunk<
  void,
  UpdatePasswordCommand,
  { rejectValue: string }
>(
  "user/updatePassword",
  async ({ userId, updatedPassword }, { rejectWithValue }) => {
    try {
      const response = await updatePasswordById(userId, updatedPassword);

      if (response && response.data) {
        if (+response.data.EC === 0) {
          toast.success(response.data.EM);
          return;
        } else if (+response.data.EC === 1) {
          toast.error(response.data.EM);
          return rejectWithValue(response.data.EM);
        }
      }
      return rejectWithValue("Không thể cập nhật mật khẩu");
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi cập nhật mật khẩu"));
    }
  }
);
export const updateUserByAdminThunk = createAsyncThunk<
  UserDto,
  UpdateUserByAdminInput,
  { rejectValue: string }
>(
  "user/updateByAdmin",
  async (formData, { rejectWithValue }) => {
    try {
      const response = await updateUserByAdmin(formData.id, formData);

      if (response && response.data && +response.data.EC === 0) {
        return { ...formData, roles: [{ id: formData.roleId, name: "" }] };
      } else {
        return rejectWithValue(response.data.EM || "Cập nhật thất bại");
      }
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi cập nhật thông tin"));
    }
  }
);
export const deleteUserThunk = createAsyncThunk<number, number, { rejectValue: string }>(
  "user/delete",
  async (userId, { rejectWithValue }) => {
    try {
      const response = await deleteUser(userId);

      if (response && response.data && +response.data.EC === 0) {
        toast.success(response.data.EM || "Xóa người dùng thành công");
        return userId; // Trả về ID để xóa khỏi store
      } else {
        toast.error(response.data.EM || "Xóa người dùng thất bại");
        return rejectWithValue(response.data.EM);
      }
    } catch (error: unknown) {
      return rejectWithValue(apiErrorMessage(error, "Lỗi khi xóa người dùng"));
    }
  }
);
const persistedUser = readPersistedUser();

const initialState: UserState = {
  currentUser: persistedUser,
  isAuthenticated: Boolean(persistedUser?.token),
  users: [],
  loading: false,
  error: null,
};

const userSlice = createSlice({
  name: "user",
  initialState,
  reducers: {
    logout: (state) => {
      state.currentUser = null;
      state.isAuthenticated = false;
      state.error = null;
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("role");
      sessionStorage.removeItem("userId");
    },
    clearError: (state) => {
      state.error = null;
    },
    setUser: (state, action: PayloadAction<UserSession>) => {
      state.currentUser = action.payload;
      state.isAuthenticated = true;
      sessionStorage.setItem("user", JSON.stringify(action.payload));
    },
  },
  extraReducers: (builder) => {
    // Đảm bảo mỗi addCase đều nhận được một action type hợp lệ
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.loading = false;

        state.users = action.payload;
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Không thể tải danh sách người dùng";
      })
      .addCase(createUserThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createUserThunk.fulfilled, (state, action) => {
        state.loading = false;
        state.users.push(action.payload); // Thêm người dùng mới vào danh sách
      })
      .addCase(createUserThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || "Tạo người dùng thất bại";
      })

      .addCase(loginByUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginByUser.fulfilled, (state, action) => {
        state.loading = false;
        state.currentUser = action.payload;
        state.isAuthenticated = true;
        sessionStorage.setItem("user", JSON.stringify(action.payload));
      })
      .addCase(loginByUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Đăng nhập thất bại";
      })
      .addCase(updateUserThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(updateUserThunk.fulfilled, (state, action) => {
        state.loading = false;
        if (state.currentUser) {
          state.currentUser = { ...state.currentUser, ...action.payload };
          sessionStorage.setItem("user", JSON.stringify(state.currentUser));
        }
        state.isAuthenticated = true;
      })
      .addCase(updateUserThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Cập nhật thất bại";
      })
      .addCase(updateUserByAdminThunk.fulfilled, (state, action) => {
        const index = state.users.findIndex((user) => user.id === action.payload.id);
        if (index !== -1) state.users[index] = action.payload;
      })
      .addCase(updateUserByAdminThunk.rejected, (state, action) => {
        state.error = action.payload ?? "Cập nhật người dùng thất bại";
      })

      .addCase(deleteUserThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(deleteUserThunk.fulfilled, (state, action) => {
        state.loading = false;
        // Xóa người dùng khỏi danh sách
        state.users = state.users.filter((user) => user.id !== action.payload);
      })
      .addCase(deleteUserThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? "Xóa người dùng thất bại";
      });
  },
});

export const { logout, clearError, setUser } = userSlice.actions;
export default userSlice.reducer;
