// @ts-nocheck
import { useState, useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import { FaUserShield, FaLock, FaEye, FaEyeSlash } from "react-icons/fa";
import { loginAdmin, clearAdminError } from "../../store/slices/adminSlice";

const AdminLoginPage = () => {
  const dispatch = useDispatch<any>();
  const navigate = useNavigate();
  const { loading, error, isAuthenticated } = useSelector(
    (state) => state.admin
  );

  const [credentials, setCredentials] = useState({
    username: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({
    username: false,
    password: false,
  });

  const trimmedUsername = useMemo(
    () => credentials.username.trim(),
    [credentials.username]
  );

  useEffect(() => {
    if (isAuthenticated) {
      console.log("Navigating to /admin");
      navigate("/admin", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    return () => {
      dispatch(clearAdminError());
    };
  }, [dispatch]);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setCredentials((prev) => ({
      ...prev,
      [field]: value,
    }));
    if (error) {
      dispatch(clearAdminError());
    }
  };

  const handleBlur = (field) => () => {
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setTouched({
      username: true,
      password: true,
    });

    if (!trimmedUsername || !credentials.password) {
      return;
    }

    dispatch(
      loginAdmin({
        username: trimmedUsername,
        password: credentials.password,
      })
    );
  };

  const usernameError =
    touched.username && !trimmedUsername ? "Vui lòng nhập tên đăng nhập" : "";
  const passwordError =
    touched.password && !credentials.password ? "Vui lòng nhập mật khẩu" : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-50 via-slate-50 to-violet-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-5xl overflow-hidden rounded-[28px] bg-white shadow-[0_40px_80px_rgba(15,23,42,0.15),0_10px_20px_rgba(15,23,42,0.08)]">
        <div className="flex flex-col lg:flex-row">
          <div className="relative hidden w-full flex-col justify-between bg-gradient-to-br from-indigo-600 via-indigo-700 to-blue-700 p-10 text-white lg:flex lg:w-2/5">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.15),transparent_55%)]" />
            <div className="relative z-10 flex flex-col gap-10">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 text-3xl text-white">
                <FaUserShield />
              </div>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold leading-tight">
                  Bảng điều khiển Admin
                </h1>
                <p className="text-sm text-indigo-100">
                  Quản lý hệ thống bán hàng, đơn hàng, nhân viên và chi nhánh
                  một cách hiệu quả.
                </p>
              </div>
              <ul className="space-y-4 text-sm text-indigo-100/90">
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_0_4px_rgba(186,230,253,0.15)]" />
                  Theo dõi hiệu suất kinh doanh theo thời gian thực
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_0_4px_rgba(186,230,253,0.15)]" />
                  Quản lý kho và đơn hàng nhanh chóng
                </li>
                <li className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_0_4px_rgba(186,230,253,0.15)]" />
                  Phân quyền nhân viên và bảo mật nâng cao
                </li>
              </ul>
            </div>
          </div>

          <div className="w-full space-y-8 p-8 sm:p-10 lg:w-3/5">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">
                Đăng nhập quản trị
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Vui lòng đăng nhập để truy cập bảng quản trị hệ thống.
              </p>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              <div className="space-y-2">
                <label
                  htmlFor="adminUsername"
                  className="text-sm font-medium text-slate-700"
                >
                  Tên đăng nhập
                </label>
                <div
                  className={`relative flex items-center rounded-2xl border bg-slate-50 transition focus-within:border-indigo-500 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(79,70,229,0.15)] ${
                    usernameError
                      ? "border-rose-400 shadow-[0_0_0_4px_rgba(248,113,113,0.15)]"
                      : "border-slate-200"
                  }`}
                >
                  <span className="flex h-12 w-12 items-center justify-center text-indigo-500">
                    <FaUserShield />
                  </span>
                  <input
                    id="adminUsername"
                    type="text"
                    className="h-12 w-full rounded-2xl bg-transparent pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    value={credentials.username}
                    onChange={handleChange("username")}
                    onBlur={handleBlur("username")}
                    placeholder="Nhập tên đăng nhập admin"
                    autoComplete="username"
                  />
                </div>
                {usernameError && (
                  <span className="text-sm text-rose-500">{usernameError}</span>
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="adminPassword"
                  className="text-sm font-medium text-slate-700"
                >
                  Mật khẩu
                </label>
                <div
                  className={`relative flex items-center rounded-2xl border bg-slate-50 transition focus-within:border-indigo-500 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(79,70,229,0.15)] ${
                    passwordError
                      ? "border-rose-400 shadow-[0_0_0_4px_rgba(248,113,113,0.15)]"
                      : "border-slate-200"
                  }`}
                >
                  <span className="flex h-12 w-12 items-center justify-center text-indigo-500">
                    <FaLock />
                  </span>
                  <input
                    id="adminPassword"
                    type={showPassword ? "text" : "password"}
                    className="h-12 w-full rounded-2xl bg-transparent pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                    value={credentials.password}
                    onChange={handleChange("password")}
                    onBlur={handleBlur("password")}
                    placeholder="Nhập mật khẩu quản trị"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-4 flex h-8 w-8 items-center justify-center text-slate-500 transition hover:text-indigo-500"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  >
                    {showPassword ? <FaEyeSlash /> : <FaEye />}
                  </button>
                </div>
                {passwordError && (
                  <span className="text-sm text-rose-500">{passwordError}</span>
                )}
              </div>

              {error && !passwordError && !usernameError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-500 text-sm font-semibold text-white transition hover:translate-y-[-1px] hover:shadow-[0_18px_30px_rgba(79,70,229,0.25)] disabled:cursor-not-allowed disabled:opacity-75"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Đang đăng nhập...</span>
                  </>
                ) : (
                  "Đăng nhập"
                )}
              </button>
            </form>

            <p className="pt-6 text-center text-xs text-slate-500">
              Liên hệ bộ phận kỹ thuật nếu bạn quên tài khoản hoặc cần cấp lại
              quyền truy cập.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
