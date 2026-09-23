import "./Register.scss";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
  FaKey,
  FaArrowLeft,
  FaCheckCircle,
  FaExclamationTriangle,
  FaRedo,
} from "react-icons/fa";
import type { TokenResponse } from "@react-oauth/google";
import { useGoogleReCaptcha } from "react-google-recaptcha-v3";
import { isAxiosError } from "axios";
import { useAppDispatch } from "../../store/hooks";
import { fetchCart } from "../../store/slices/cartSlice";
import { setUser } from "../../store/slices/userSlice";
import {
  createEmailVerificationChallenge,
  loginWithGoogle,
  verifyCaptcha,
  verifyEmailChallenge,
} from "../../services/authService";
import { GOOGLE_OAUTH_ENABLED, RECAPTCHA_ENABLED } from "../../config/auth";
import { GoogleOAuthButton } from "../Auth/GoogleOAuthButton";
import type { ApiEnvelope } from "../../types/http";

type RegisterStep = "FORM" | "OTP_PENDING" | "REGISTRATION_FAILED";

interface ValidationState {
  isValidEmail: boolean;
  isValidPhone: boolean;
  isValidUsername: boolean;
  isValidPassword: boolean;
  isValidConfirmPassword: boolean;
}

const defaultValidInput: ValidationState = {
  isValidEmail: true,
  isValidPhone: true,
  isValidUsername: true,
  isValidPassword: true,
  isValidConfirmPassword: true,
};

/**
 * Extracts a user-facing error message from an unknown caught value.
 * Prioritises the API envelope EM field, then falls back to a safe generic message.
 */
const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (isAxiosError<ApiEnvelope<unknown>>(error)) {
    return error.response?.data?.EM || fallback;
  }
  return fallback;
};

const Register = () => {
  const navigate = useNavigate();
  const { executeRecaptcha } = useGoogleReCaptcha();
  const dispatch = useAppDispatch();

  // State machine step
  const [step, setStep] = useState<RegisterStep>("FORM");

  // Form input states
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // OTP states
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [otpError, setOtpError] = useState("");

  // Token & failure recovery states (Required 7)
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [registrationError, setRegistrationError] = useState<string>("");
  const [isRetryableError, setIsRetryableError] = useState<boolean>(false);

  // Loading states
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Countdown timer effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const [objCheckInput, setObjCheckInput] = useState<ValidationState>(defaultValidInput);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isValidInputs = (): boolean => {
    setObjCheckInput(defaultValidInput);
    setFieldErrors({});
    const errors: Record<string, string> = {};

    const trimmedEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmedEmail) {
      errors.email = "Vui lòng nhập email";
    } else if (!emailRegex.test(trimmedEmail)) {
      errors.email = "Email không đúng định dạng";
    }

    const trimmedPhone = phone.trim();
    if (!trimmedPhone) {
      errors.phone = "Vui lòng nhập số điện thoại";
    } else if (trimmedPhone.length < 8 || trimmedPhone.length > 20) {
      errors.phone = "Số điện thoại phải từ 8 đến 20 chữ số";
    }

    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      errors.username = "Vui lòng nhập tên người dùng";
    } else if (trimmedUsername.length < 3 || trimmedUsername.length > 100) {
      errors.username = "Tên người dùng phải từ 3 đến 100 ký tự";
    }

    if (!password) {
      errors.password = "Vui lòng nhập mật khẩu";
    } else if (password.length < 8 || password.length > 128) {
      errors.password = "Mật khẩu phải từ 8 đến 128 ký tự";
    }

    if (password !== confirmPassword) {
      errors.confirmPassword = "Mật khẩu xác nhận không khớp";
    }

    if (Object.keys(errors).length > 0) {
      setObjCheckInput({
        isValidEmail: !errors.email,
        isValidPhone: !errors.phone,
        isValidUsername: !errors.username,
        isValidPassword: !errors.password,
        isValidConfirmPassword: !errors.confirmPassword,
      });
      setFieldErrors(errors);
      const firstError = Object.values(errors)[0];
      toast.error(firstError);
      return false;
    }

    return true;
  };

  const getRecaptchaTokenIfEnabled = async (
    action: string,
  ): Promise<string | undefined | null> => {
    if (!RECAPTCHA_ENABLED) {
      return undefined;
    }

    if (!executeRecaptcha) {
      toast.error("reCAPTCHA chưa sẵn sàng, vui lòng thử lại sau giây lát");
      return null;
    }

    try {
      return await executeRecaptcha(action);
    } catch {
      toast.error("Xác minh reCAPTCHA thất bại");
      return null;
    }
  };

  const handleGoogleSuccess = async (credentialResponse: TokenResponse) => {
    try {
      const recaptchaToken = await getRecaptchaTokenIfEnabled("register");
      if (recaptchaToken === null) return;
      if (recaptchaToken) await verifyCaptcha(recaptchaToken);

      const response = await loginWithGoogle(credentialResponse);
      toast.success("Login successful!");
      void dispatch(fetchCart());
      dispatch(setUser(response.data.DT));
      navigate("/");
    } catch {
      toast.error("Google login failed!");
    }
  };

  // Step 1: Validate form, verify captcha, and request OTP challenge
  const handleRequestOtp = async () => {
    if (!isValidInputs()) return;

    const recaptchaToken = await getRecaptchaTokenIfEnabled("register");
    if (recaptchaToken === null) return;

    setIsSubmitting(true);
    setOtpError("");
    try {
      const response = recaptchaToken
        ? await createEmailVerificationChallenge(email.trim(), recaptchaToken)
        : await createEmailVerificationChallenge(email.trim());
      const data = response.data;
      if (data.EC === 0 && data.DT) {
        setChallengeId(data.DT.challengeId);
        setCooldown(data.DT.resendAfterSeconds || 60);
        setAttemptsRemaining(null);
        setStep("OTP_PENDING");
        toast.success("Mã xác thực OTP đã được gửi đến email của bạn!");
      } else {
        toast.error(data.EM || "Không thể gửi mã xác thực");
      }
    } catch (error: unknown) {
      const msg = extractErrorMessage(error, "Lỗi khi gửi yêu cầu xác thực email");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2a: Resend OTP
  const handleResendOtp = async () => {
    if (cooldown > 0 || isSubmitting) return;

    const recaptchaToken = await getRecaptchaTokenIfEnabled("register");
    if (recaptchaToken === null) return;

    setIsSubmitting(true);
    setOtpError("");
    try {
      const response = recaptchaToken
        ? await createEmailVerificationChallenge(email.trim(), recaptchaToken)
        : await createEmailVerificationChallenge(email.trim());
      const data = response.data;
      if (data.EC === 0 && data.DT) {
        setChallengeId(data.DT.challengeId);
        setCooldown(data.DT.resendAfterSeconds || 60);
        setAttemptsRemaining(null);
        setOtp("");
        toast.success("Đã gửi mã xác thực mới vào email của bạn!");
      } else {
        toast.error(data.EM || "Không thể gửi lại mã xác thực");
      }
    } catch (error: unknown) {
      const msg = extractErrorMessage(error, "Lỗi khi gửi lại mã xác thực");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Finalize registration with token
  const executeRegistration = async (token: string) => {
    setIsSubmitting(true);
    setRegistrationError("");
    try {
      const regRes = await registerNewUser(
        email.trim(),
        phone.trim(),
        username.trim(),
        password,
        token
      );

      const regData = regRes.data;
      if (+regData.EC === 0) {
        toast.success("Đăng ký tài khoản thành công! Vui lòng đăng nhập.");
        navigate("/login");
      } else {
        const errorMsg = regData.EM || "Đăng ký không thành công";
        const isEmailExists =
          errorMsg.includes("already exist") || errorMsg.includes("đã tồn tại");
        setIsRetryableError(!isEmailExists);
        setRegistrationError(errorMsg);
        setStep("REGISTRATION_FAILED");
        toast.error(errorMsg);
      }
    } catch (error: unknown) {
      const msg = extractErrorMessage(
        error,
        "Có lỗi xảy ra khi tạo tài khoản. Vui lòng thử lại."
      );
      setIsRetryableError(true);
      setRegistrationError(msg);
      setStep("REGISTRATION_FAILED");
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2b: Verify OTP and complete registration
  const handleVerifyAndRegister = async () => {
    if (!otp || otp.trim().length !== 6) {
      setOtpError("Vui lòng nhập đầy đủ 6 chữ số OTP");
      return;
    }

    setIsSubmitting(true);
    setOtpError("");
    try {
      // 1. Verify OTP with challengeId
      const verifyRes = await verifyEmailChallenge(challengeId, otp.trim());
      const verifyData = verifyRes.data;

      if (verifyData.EC !== 0 || !verifyData.DT?.verificationToken) {
        const remaining = verifyData.DT?.attemptsRemaining;
        if (typeof remaining === "number") {
          setAttemptsRemaining(remaining);
          setOtpError(`Mã không đúng. Bạn còn ${remaining} lần thử.`);
        } else {
          setOtpError(verifyData.EM || "Xác minh OTP thất bại");
        }
        setIsSubmitting(false);
        return;
      }

      const token = verifyData.DT.verificationToken;
      setVerificationToken(token);

      // 2. Finalize registration with token
      await executeRegistration(token);
    } catch (error: unknown) {
      if (isAxiosError<ApiEnvelope<{ attemptsRemaining?: number }>>(error)) {
        const errorData = error.response?.data;
        const msg = errorData?.EM || "Có lỗi xảy ra khi xác thực mã OTP";
        if (typeof errorData?.DT?.attemptsRemaining === "number") {
          setAttemptsRemaining(errorData.DT.attemptsRemaining);
          setOtpError(`Mã không đúng. Bạn còn ${errorData.DT.attemptsRemaining} lần thử.`);
        } else {
          setOtpError(msg);
        }
        toast.error(msg);
      } else {
        const msg = "Có lỗi xảy ra khi xác thực mã OTP";
        setOtpError(msg);
        toast.error(msg);
      }
      setIsSubmitting(false);
    }
  };

  // Need to import verifyEmailChallenge — it's already imported at top
  // (verifyEmailChallenge is imported from authService)

  return (
    <div className="register-container py-4">
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-md-9">
            <div className="card border-0 shadow">
              <div className="row g-0">
                {/* Banner section - left */}
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
                          "url('https://images.unsplash.com/photo-1595461135849-c08a9a4967b4?ixlib=rb-4.0.3&auto=format&fit=crop&w=1868&q=80')",
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

                {/* Form section - right */}
                <div className="col-md-7">
                  <div className="card-body p-3 p-md-4">
                    <div className="text-center d-md-none mb-3">
                      <FaShoppingBag className="text-primary fs-1 mb-2" />
                      <h3 className="fw-bold">HappyShop</h3>
                      <p className="text-muted small">
                        Thời trang thoải mái - Phong cách mỗi ngày
                      </p>
                    </div>

                    {step === "FORM" ? (
                      <>
                        <div className="d-flex align-items-center mb-3">
                          <FaUserPlus className="text-primary me-2" />
                          <span className="h4 fw-bold mb-0">Đăng ký tài khoản</span>
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
                              {fieldErrors.email || "Vui lòng nhập email hợp lệ"}
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
                              {fieldErrors.phone || "Vui lòng nhập số điện thoại (8 - 20 chữ số)"}
                            </div>
                          )}
                        </div>

                        <div className="form-floating mb-2">
                          <input
                            type="text"
                            className={`form-control form-control-sm ${
                              !objCheckInput.isValidUsername ? "is-invalid" : ""
                            }`}
                            id="floatingUsername"
                            placeholder="Username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                          />
                          <label htmlFor="floatingUsername">
                            <FaUserAlt className="me-2" />
                            Tên người dùng
                          </label>
                          {!objCheckInput.isValidUsername && (
                            <div className="invalid-feedback">
                              {fieldErrors.username || "Vui lòng nhập tên người dùng (3 - 100 ký tự)"}
                            </div>
                          )}
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
                              {fieldErrors.password || "Mật khẩu phải từ 8 đến 128 ký tự"}
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
                              {fieldErrors.confirmPassword || "Mật khẩu xác nhận không khớp"}
                            </div>
                          )}
                        </div>

                        <div className="d-grid mb-3">
                          <button
                            className="btn btn-primary py-2"
                            data-testid="request-otp-btn"
                            onClick={handleRequestOtp}
                            disabled={isSubmitting}
                            style={{
                              background:
                                "linear-gradient(to right, #8A2387, #E94057, #F27121)",
                              border: "none",
                            }}
                          >
                            {isSubmitting ? (
                              <>
                                <span
                                  className="spinner-border spinner-border-sm me-2"
                                  role="status"
                                  aria-hidden="true"
                                ></span>
                                Đang gửi mã OTP...
                              </>
                            ) : (
                              <>
                                <FaUserPlus className="me-2" />
                                Đăng ký
                              </>
                            )}
                          </button>
                        </div>

                        {GOOGLE_OAUTH_ENABLED && (
                          <>
                            <div className="divider">
                              <p>HOẶC</p>
                            </div>

                            <div className="social-login-buttons d-grid gap-2 mb-3">
                              <GoogleOAuthButton
                                label="Đăng ký bằng Google"
                                errorMessage="Google registration failed!"
                                onSuccess={handleGoogleSuccess}
                              />
                            </div>
                          </>
                        )}
                      </>
                    ) : step === "OTP_PENDING" ? (
                      /* OTP_PENDING STEP */
                      <div className="otp-verification-section">
                        <div className="d-flex align-items-center mb-3">
                          <button
                            type="button"
                            className="btn btn-link p-0 me-2 text-decoration-none text-muted"
                            onClick={() => setStep("FORM")}
                            data-testid="back-to-form-btn"
                            title="Quay lại sửa thông tin"
                          >
                            <FaArrowLeft />
                          </button>
                          <span className="h4 fw-bold mb-0">Xác thực Email</span>
                        </div>

                        <div className="alert alert-info py-2 px-3 small mb-3">
                          Mã xác thực 6 số đã được gửi tới <strong>{email}</strong>. Vui lòng kiểm tra hộp thư (bao gồm cả thư rác).
                        </div>

                        <div className="form-floating mb-3">
                          <input
                            type="text"
                            maxLength={6}
                            autoFocus
                            className={`form-control form-control-lg text-center fs-4 fw-bold ${
                              otpError ? "is-invalid" : ""
                            }`}
                            style={{ letterSpacing: "8px" }}
                            id="floatingOtp"
                            data-testid="otp-input"
                            placeholder="123456"
                            value={otp}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, "");
                              setOtp(val);
                              if (otpError) setOtpError("");
                            }}
                          />
                          <label htmlFor="floatingOtp">
                            <FaKey className="me-2" />
                            Nhập mã OTP 6 chữ số
                          </label>
                          {otpError && (
                            <div className="invalid-feedback d-block mt-1">
                              {otpError}
                            </div>
                          )}
                        </div>

                        <div className="d-grid mb-3">
                          <button
                            className="btn btn-primary py-2"
                            data-testid="verify-otp-btn"
                            onClick={handleVerifyAndRegister}
                            disabled={isSubmitting || otp.length !== 6}
                            style={{
                              background:
                                "linear-gradient(to right, #8A2387, #E94057, #F27121)",
                              border: "none",
                            }}
                          >
                            {isSubmitting ? (
                              <>
                                <span
                                  className="spinner-border spinner-border-sm me-2"
                                  role="status"
                                  aria-hidden="true"
                                ></span>
                                Đang xác thực...
                              </>
                            ) : (
                              <>
                                <FaCheckCircle className="me-2" />
                                Xác nhận & Hoàn tất đăng ký
                              </>
                            )}
                          </button>
                        </div>

                        <div className="text-center mb-3">
                          {cooldown > 0 ? (
                            <span className="text-muted small">
                              Gửi lại mã sau <strong>{cooldown}s</strong>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-link btn-sm text-decoration-none"
                              data-testid="resend-otp-btn"
                              onClick={handleResendOtp}
                              disabled={isSubmitting}
                            >
                              Gửi lại mã OTP
                            </button>
                          )}
                        </div>

                        <div className="text-center">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => setStep("FORM")}
                          >
                            <FaArrowLeft className="me-1" />
                            Thay đổi email hoặc thông tin
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* REGISTRATION_FAILED STEP */
                      <div className="registration-failed-section">
                        <div className="d-flex align-items-center mb-3">
                          <FaExclamationTriangle className="text-danger me-2 fs-4" />
                          <span className="h4 fw-bold mb-0 text-danger">Đăng ký chưa hoàn tất</span>
                        </div>

                        <div className="alert alert-danger py-2 px-3 small mb-3">
                          {registrationError || "Đã xảy ra lỗi trong quá trình tạo tài khoản."}
                        </div>

                        {isRetryableError && verificationToken && (
                          <div className="d-grid mb-3">
                            <button
                              type="button"
                              className="btn btn-primary py-2"
                              data-testid="retry-register-btn"
                              onClick={() => void executeRegistration(verificationToken)}
                              disabled={isSubmitting}
                              style={{
                                background:
                                  "linear-gradient(to right, #8A2387, #E94057, #F27121)",
                                border: "none",
                              }}
                            >
                              {isSubmitting ? (
                                <>
                                  <span
                                    className="spinner-border spinner-border-sm me-2"
                                    role="status"
                                    aria-hidden="true"
                                  ></span>
                                  Đang thử lại...
                                </>
                              ) : (
                                <>
                                  <FaRedo className="me-2" />
                                  Thử lại hoàn tất đăng ký
                                </>
                              )}
                            </button>
                          </div>
                        )}

                        <div className="text-center">
                          <button
                            type="button"
                            className="btn btn-outline-secondary btn-sm"
                            data-testid="return-to-form-btn"
                            onClick={() => {
                              setVerificationToken(null);
                              setStep("FORM");
                            }}
                          >
                            <FaArrowLeft className="me-1" />
                            Quay lại sửa thông tin
                          </button>
                        </div>
                      </div>
                    )}

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
