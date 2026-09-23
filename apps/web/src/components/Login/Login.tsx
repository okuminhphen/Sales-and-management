// @ts-nocheck
import "./Login.scss";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "react-toastify";
import { useDispatch, useSelector } from "react-redux";
import {
  FaUserAlt,
  FaLock,
  FaSignInAlt,
  FaUserPlus,
  FaTshirt,
  FaBed,
  FaMoon,
  FaShoppingBag,
} from "react-icons/fa";
import type { TokenResponse } from "@react-oauth/google";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";

import { loginByUser, logout, setUser } from "../../store/slices/userSlice";
import { fetchCart } from "../../store/slices/cartSlice";
import { loginWithGoogle, verifyCaptcha } from "../../services/authService";
import { GOOGLE_OAUTH_ENABLED } from "../../config/auth";
import { GoogleOAuthButton } from "../Auth/GoogleOAuthButton";

const Login = (props) => {
  const navigate = useNavigate();
  const dispatch = useDispatch<any>();
  const { loading } = useSelector((state: any) => state.user);
  const { executeRecaptcha } = useGoogleReCaptcha();
  const goToRegister = () => {
    navigate("/register");
  };

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");

  // const [showOtp, setShowOtp] = useState(false);
  // const [tempUser, setTempUser] = useState({});
  // const [otp, setOtp] = useState("");

  const defaultValidInput = {
    isValidEmailOrPhone: true,
    isValidPassword: true,
  };

  const [objValidInput, setObjValidInput] = useState(defaultValidInput);

  const handleGoogleSuccess = async (credentialResponse: TokenResponse) => {
    try {
      if (!executeRecaptcha) {
        toast.error("Recaptcha not yet loaded");
        return;
      }

      // Lấy token reCAPTCHA v3
      const token = await executeRecaptcha("login"); // "login" là action

      // Gửi token lên backend
      const captchaResult = await verifyCaptcha(token);
      if (!captchaResult) {
        toast.error("Failed captcha verification");
        return;
      }

      const response = await loginWithGoogle(credentialResponse);
      if (!response && !response.data) {
        toast.error("Failed to login with gg");
        return;
      }

      toast.success("Login successful!");
      dispatch(setUser(response.data.DT));
      dispatch(fetchCart());
      navigate("/");
      // setTempUser(response.data.DT);
      // const sendOTPResponse = await sendOTP(response.data.DT.email);

      // if (!sendOTPResponse && !sendOTPResponse.data) {
      //   toast.error("send otp error");
      //   return;
      // } else {
      //   toast.success("send otp success");
      // }
    } catch (error) {
      console.log(error);
      toast.error("Google login failed!");
    }
  };
  // const handleSendOtp = async () => {
  //   try {
  //     if (!otp) {
  //       toast.error("Vui lòng nhập OTP");
  //       return;
  //     }

  //     const response = await verifyOTP(otp, tempUser.email);
  //     if (!response && !response.data) {
  //       toast.error("Failed to verify");
  //       return;
  //     }
  //     if (+response.data.EC === 0) {
  //       toast.success("Login successful!");
  //       dispatch(setUser(tempUser));
  //       dispatch(fetchCart());
  //       navigate("/");
  //     }
  //   } catch (error) {
  //     toast.error("Không thể gửi OTP");
  //   }
  // };
  const handleLogin = async () => {
    if (!executeRecaptcha) {
      toast.error("Recaptcha not yet loaded");
      return;
    }

    // Lấy token reCAPTCHA v3
    const token = await executeRecaptcha("login"); // "login" là action
    // Gửi token lên backend
    const captchaResult = await verifyCaptcha(token);
    if (!captchaResult) {
      toast.error("Failed captcha verification");
      return;
    }

    await dispatch(logout());
    setObjValidInput(defaultValidInput);
    if (!emailOrPhone) {
      toast.error("Please enter email or phone");
      setObjValidInput({ ...defaultValidInput, isValidEmailOrPhone: false });
      return;
    }
    if (!password) {
      toast.error("Please enter password");
      setObjValidInput({ ...defaultValidInput, isValidPassword: false });
      return;
    }

    const resultAction = await dispatch(
      loginByUser({ emailOrPhone, password })
    );

    if (loginByUser.fulfilled.match(resultAction)) {
      toast.success("Login successful!");
      dispatch(fetchCart());
      navigate("/");
    } else {
      toast.error("Login failed!");
    }
  };
  const handlePressEnter = (e) => e.key === "Enter" && handleLogin();

  return (
    <div className="login-container py-4">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-9">
            <div className="card border-0 shadow">
              <div className="row g-0">
                {/* Banner section */}
                <div className="col-md-5 d-none d-md-block">
                  <div className="banner-section h-100 text-white d-flex flex-column justify-content-center p-4 rounded-start">
                    <div className="position-relative">
                      <div className="mb-4">
                        <FaShoppingBag className="fs-1 mb-2" />
                        <h2 className="brand mb-1">HappyShop</h2>
                        <p className="details mb-3">
                          Thời trang thoải mái - Phong cách mỗi ngày
                        </p>
                      </div>

                      <div className="mb-3">
                        <p className="fs-6 fw-light mb-2">
                          Sản phẩm chúng tôi cam kết:
                        </p>
                        <div className="d-flex align-items-center mb-2">
                          <div className="bg-white bg-opacity-25 p-1 rounded-circle me-2">
                            <FaTshirt className="fs-6" />
                          </div>
                          <span className="small">Chất liệu cao cấp</span>
                        </div>
                        <div className="d-flex align-items-center mb-2">
                          <div className="bg-white bg-opacity-25 p-1 rounded-circle me-2">
                            <FaBed className="fs-6" />
                          </div>
                          <span className="small">Thiết kế thoải mái</span>
                        </div>
                        <div className="d-flex align-items-center">
                          <div className="bg-white bg-opacity-25 p-1 rounded-circle me-2">
                            <FaMoon className="fs-6" />
                          </div>
                          <span className="small">Phong cách tự tin</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Login form section */}
                <div className="col-md-7">
                  <div className="card-body p-3 p-md-4">
                    <div className="text-center d-md-none mb-3">
                      <FaShoppingBag className="text-primary fs-1 mb-2" />
                      <h3 className="brand">HappyShop</h3>
                      <p className="text-muted small">
                        Thời trang thoải mái - Phong cách mỗi ngày
                      </p>
                    </div>

                    <div className="d-flex align-items-center mb-3">
                      <FaUserAlt className="text-primary me-2" />
                      <span className="h4 fw-bold mb-0">Đăng nhập</span>
                    </div>

                    <p className="text-muted small mb-3">
                      Đăng nhập để mua sắm quần áo chất lượng cao
                    </p>

                    <div className="form-section">
                      <div className="form-floating mb-3">
                        <input
                          type="text"
                          className={`form-control form-control-sm ${
                            !objValidInput.isValidEmailOrPhone
                              ? "is-invalid"
                              : ""
                          }`}
                          id="floatingEmail"
                          placeholder="Email or Phone"
                          value={emailOrPhone}
                          onChange={(event) =>
                            setEmailOrPhone(event.target.value)
                          }
                        />
                        <label htmlFor="floatingEmail">
                          <FaUserAlt className="me-2" />
                          Email hoặc Số điện thoại
                        </label>
                        {!objValidInput.isValidEmailOrPhone && (
                          <div className="invalid-feedback">
                            Vui lòng nhập email hoặc số điện thoại
                          </div>
                        )}
                      </div>

                      <div className="form-floating mb-3">
                        <input
                          type="password"
                          className={`form-control form-control-sm ${
                            !objValidInput.isValidPassword ? "is-invalid" : ""
                          }`}
                          id="floatingPassword"
                          placeholder="Password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          onKeyDown={(event) => handlePressEnter(event)}
                        />
                        <label htmlFor="floatingPassword">
                          <FaLock className="me-2" />
                          Mật khẩu
                        </label>
                        {!objValidInput.isValidPassword && (
                          <div className="invalid-feedback">
                            Vui lòng nhập mật khẩu
                          </div>
                        )}
                      </div>

                      <div className="form-check mb-3">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="rememberMe"
                        />
                        <label
                          className="form-check-label"
                          htmlFor="rememberMe"
                        >
                          Ghi nhớ đăng nhập
                        </label>
                      </div>

                      {/* <div className="recaptcha-container">
                        <ReCAPTCHA
                          sitekey={siteKey}
                          onChange={handleRecaptchaChange}
                        />
                      </div> */}

                      <div className="d-grid mb-3">
                        <button
                          className="btn btn-primary py-2"
                          onClick={handleLogin}
                          disabled={loading}
                        >
                          <FaSignInAlt className="me-2" />
                          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
                        </button>
                      </div>

                      {/*{showOtp && (
                        <>
                          <div className="form-floating mb-3">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="Nhập mã OTP"
                              value={otp}
                              onChange={(e) => setOtp(e.target.value)}
                            />
                            <label>Nhập mã OTP</label>
                          </div>

                          <div className="d-grid mb-3">
                            <button
                              className="btn btn-success py-2"
                              onClick={handleSendOtp}
                            >
                              Xác minh OTP
                            </button>
                          </div>
                        </>
                      )}*/}

                      {GOOGLE_OAUTH_ENABLED && (
                        <>
                          <div className="divider">
                            <p>HOẶC</p>
                          </div>

                          <div className="social-login-buttons d-grid gap-2 mb-3">
                            <GoogleOAuthButton
                              label="Đăng nhập bằng Google"
                              errorMessage="Google login failed!"
                              onSuccess={handleGoogleSuccess}
                            />
                          </div>
                        </>
                      )}

                      <div className="d-grid">
                        <button
                          className="btn btn-outline-primary py-2"
                          onClick={() => goToRegister()}
                        >
                          <FaUserPlus className="me-2" />
                          Tạo tài khoản mới
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
