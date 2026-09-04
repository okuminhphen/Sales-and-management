// @ts-nocheck
import "./Register.scss";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { toast } from "react-toastify";
import { registerNewUser } from "../../services/userService";
import {
  FaUserAlt,
  FaLock,
  FaUserPlus,
  FaEnvelope,
  FaPhone,
  FaShoppingBag,
  FaTshirt,
  FaBed,
  FaGoogle,
} from "react-icons/fa";
import { useGoogleLogin } from "@react-oauth/google";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { useDispatch } from "react-redux";
import { fetchCart } from "../../store/slices/cartSlice";
import { setUser } from "../../store/slices/userSlice";
import { loginWithGoogle, verifyCaptcha } from "../../services/authService";

const Register = () => {
  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const [isRegistering, setIsRegistering] = useState(false);
  const dispatch = useDispatch<any>();
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const defaultValidInput = {
    isValidEmail: true,
    isValidPhone: true,
    isValidPassword: true,
    isValidConfirmPassword: true,
  };

  const [objCheckInput, setObjCheckInput] = useState(defaultValidInput);

  const isValidInputs = () => {
    setObjCheckInput(defaultValidInput);
    if (!email) {
      toast.error("Email is required");
      setObjCheckInput({ ...defaultValidInput, isValidEmail: false });
      return false;
    }
    if (!phone) {
      toast.error("Phone is required");
      setObjCheckInput({ ...defaultValidInput, isValidPhone: false });
      return false;
    }
    if (!password) {
      toast.error("Password is required");
      setObjCheckInput({ ...defaultValidInput, isValidPassword: false });
      return false;
    }
    if (password !== confirmPassword) {
      toast.error("Your password is not the same");
      setObjCheckInput({ ...defaultValidInput, isValidConfirmPassword: false });
      return false;
    }
    return true;
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      if (!executeRecaptcha) {
        toast.error("Recaptcha not yet loaded");
        return;
      }

      // Lấy token reCAPTCHA v3
      const token = await executeRecaptcha("register"); // "login" là action
      // Gửi token lên backend
      const captchaResult = await verifyCaptcha(token);
      if (!captchaResult) {
        toast.error("Failed captcha verification");
        return;
      }
      const response = await loginWithGoogle(credentialResponse);
      console.log(response);
      toast.success("Login successful!");
      dispatch(fetchCart());
      dispatch(setUser(response.data.DT));
      navigate("/");
    } catch (error) {
      console.log(error);
      toast.error("Google login failed!");
    }
  };

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => toast.error("Google registration failed!"),
  });

  const handleRegister = async () => {
    if (!executeRecaptcha) {
      toast.error("Recaptcha not yet loaded");
      return;
    }

    // Lấy token reCAPTCHA v3
    const token = await executeRecaptcha("register"); // "login" là action
    // Gửi token lên backend
    const captchaResult = await verifyCaptcha(token);
    if (!captchaResult) {
      toast.error("Failed captcha verification");
      return;
    }
    let check = isValidInputs();
    if (check) {
      setIsRegistering(true);
      try {
        let response = await registerNewUser(email, phone, username, password);
        let serverData = response.data;
        if (+serverData.EC === 0) {
          toast.success(serverData.EM);
          navigate("/login");
        } else {
          toast.error(serverData.EM);
        }
      } catch (error) {
        toast.error("An error occurred");
      } finally {
        setIsRegistering(false);
      }
    }
  };

  return (
    <div className="register-container py-4">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-9">
            <div className="card border-0 shadow">
              <div className="row g-0">
                {/* Banner section - smaller width */}
                <div className="col-md-5 d-none d-md-block">
                  <div
                    className="h-100 text-white d-flex flex-column justify-content-center p-4 rounded-start"
                    style={{
                      background:
                        "linear-gradient(135deg, #8A2387 0%, #E94057 50%, #F27121 100%)",
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        opacity: 0.15,
                        backgroundImage:
                          "url('https://images.unsplash.com/photo-1595461135849-c08a9a4967b4?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1868&q=80')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                      }}
                    ></div>
                    <div className="position-relative">
                      <div className="mb-4">
                        <FaShoppingBag className="fs-1 mb-2" />
                        <h2 className="fw-bold mb-1">HappyShop</h2>
                        <p className="small mb-3">
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
                          <span className="small">Form dáng thoải mái</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Register form section - increased width */}
                <div className="col-md-7">
                  <div className="card-body p-3 p-md-4">
                    <div className="text-center d-md-none mb-3">
                      <FaShoppingBag className="text-primary fs-1 mb-2" />
                      <h3 className="fw-bold">HappyShop</h3>
                      <p className="text-muted small">
                        Thời trang thoải mái - Phong cách mỗi ngày
                      </p>
                    </div>

                    <div className="d-flex align-items-center mb-3">
                      <FaUserPlus className="text-primary me-2" />
                      <span className="h4 fw-bold mb-0">Đăng ký</span>
                    </div>

                    <p className="text-muted small mb-3">
                      Tạo tài khoản để mua sắm quần áo chất lượng cao
                    </p>

                    <div className="form-floating mb-2">
                      <input
                        type="email"
                        className={`form-control form-control-sm ${
                          !objCheckInput.isValidEmail ? "is-invalid" : ""
                        }`}
                        id="floatingEmail"
                        placeholder="Email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                      <label htmlFor="floatingEmail">
                        <FaEnvelope className="me-2" />
                        Email
                      </label>
                      {!objCheckInput.isValidEmail && (
                        <div className="invalid-feedback">
                          Vui lòng nhập email
                        </div>
                      )}
                    </div>

                    <div className="form-floating mb-2">
                      <input
                        type="tel"
                        className={`form-control form-control-sm ${
                          !objCheckInput.isValidPhone ? "is-invalid" : ""
                        }`}
                        id="floatingPhone"
                        placeholder="Phone"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                      <label htmlFor="floatingPhone">
                        <FaPhone className="me-2" />
                        Số điện thoại
                      </label>
                      {!objCheckInput.isValidPhone && (
                        <div className="invalid-feedback">
                          Vui lòng nhập số điện thoại
                        </div>
                      )}
                    </div>

                    <div className="form-floating mb-2">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        id="floatingUsername"
                        placeholder="Username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                      <label htmlFor="floatingUsername">
                        <FaUserAlt className="me-2" />
                        Tên người dùng
                      </label>
                    </div>

                    <div className="form-floating mb-2">
                      <input
                        type="password"
                        className={`form-control form-control-sm ${
                          !objCheckInput.isValidPassword ? "is-invalid" : ""
                        }`}
                        id="floatingPassword"
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <label htmlFor="floatingPassword">
                        <FaLock className="me-2" />
                        Mật khẩu
                      </label>
                      {!objCheckInput.isValidPassword && (
                        <div className="invalid-feedback">
                          Vui lòng nhập mật khẩu
                        </div>
                      )}
                    </div>

                    <div className="form-floating mb-3">
                      <input
                        type="password"
                        className={`form-control form-control-sm ${
                          !objCheckInput.isValidConfirmPassword
                            ? "is-invalid"
                            : ""
                        }`}
                        id="floatingConfirmPassword"
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <label htmlFor="floatingConfirmPassword">
                        <FaLock className="me-2" />
                        Nhập lại mật khẩu
                      </label>
                      {!objCheckInput.isValidConfirmPassword && (
                        <div className="invalid-feedback">
                          Mật khẩu xác nhận không khớp
                        </div>
                      )}
                    </div>

                    {/* <div className="recaptcha-container">
                      <ReCAPTCHA
                        sitekey={siteKey}
                        onChange={handleRecaptchaChange}
                      />
                    </div> */}

                    <div className="form-check mb-3">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="agreeTerms"
                      />
                      <label className="form-check-label" htmlFor="agreeTerms">
                        Tôi đồng ý với <a href="#">điều khoản</a> và{" "}
                        <a href="#">chính sách bảo mật</a>
                      </label>
                    </div>

                    <div className="d-grid mb-3">
                      <button
                        className="btn btn-primary py-2"
                        onClick={handleRegister}
                        disabled={isRegistering}
                        style={{
                          background:
                            "linear-gradient(to right, #8A2387, #E94057, #F27121)",
                          border: "none",
                        }}
                      >
                        {isRegistering ? (
                          <>
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                              aria-hidden="true"
                            ></span>
                            Đang đăng ký...
                          </>
                        ) : (
                          <>
                            <FaUserPlus className="me-2" />
                            Đăng ký
                          </>
                        )}
                      </button>
                    </div>

                    <div className="divider">
                      <p>HOẶC</p>
                    </div>

                    <div className="social-login-buttons d-grid gap-2 mb-3">
                      <button
                        onClick={() => googleLogin()}
                        className="btn google-btn"
                      >
                        <FaGoogle className="google-icon" />
                        Đăng ký bằng Google
                      </button>
                    </div>

                    <div className="login-link">
                      <p className="mb-0 small">
                        Đã có tài khoản?{" "}
                        <a
                          className="text-decoration-none fw-bold"
                          href="#"
                          onClick={() => navigate("/login")}
                        >
                          Đăng nhập
                        </a>
                      </p>
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

export default Register;
