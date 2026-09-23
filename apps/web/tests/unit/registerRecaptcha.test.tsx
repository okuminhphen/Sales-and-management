import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
let mockExecuteRecaptcha: any = null;
let mockRecaptchaEnabled = true;

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../../src/store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: () => ({
    executeRecaptcha: mockExecuteRecaptcha,
  }),
}));

vi.mock("../../src/config/auth", () => ({
  get RECAPTCHA_ENABLED() {
    return mockRecaptchaEnabled;
  },
  GOOGLE_OAUTH_ENABLED: false,
  GOOGLE_CLIENT_ID: "",
  RECAPTCHA_SITE_KEY: "test-site-key",
}));

vi.mock("../../src/components/Auth/GoogleOAuthButton", () => ({
  GoogleOAuthButton: () => <button data-testid="google-oauth-btn">Google</button>,
}));

vi.mock("../../src/services/authService", () => ({
  createEmailVerificationChallenge: vi.fn(),
  verifyEmailChallenge: vi.fn(),
  verifyCaptcha: vi.fn(),
  loginWithGoogle: vi.fn(),
}));

vi.mock("../../src/services/userService", () => ({
  registerNewUser: vi.fn(),
}));

vi.mock("react-toastify", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import Register from "../../src/components/Register/Register";
import * as authService from "../../src/services/authService";
import { toast } from "react-toastify";

describe("Register component reCAPTCHA fail-closed & bypass handling (P1 Finding 1)", () => {
  const fillValidRegistrationForm = () => {
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "test@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "testuser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRecaptchaEnabled = true;
    mockExecuteRecaptcha = vi.fn().mockResolvedValue("mock-captcha-token");

    vi.mocked(authService.createEmailVerificationChallenge).mockResolvedValue({
      data: {
        EC: 0,
        EM: "OTP sent",
        DT: {
          challengeId: "test-challenge-uuid",
          expiresInSeconds: 300,
          resendAfterSeconds: 60,
        },
      },
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("proceeds to OTP challenge when reCAPTCHA is explicitly disabled via config", async () => {
    mockRecaptchaEnabled = false;

    render(<Register />);
    fillValidRegistrationForm();

    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(authService.createEmailVerificationChallenge).toHaveBeenCalledWith(
        "test@example.com"
      );
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });

    // Should NOT call captcha functions
    expect(authService.verifyCaptcha).not.toHaveBeenCalled();
  });

  it("proceeds to OTP challenge when reCAPTCHA is enabled and verification succeeds", async () => {
    mockRecaptchaEnabled = true;
    mockExecuteRecaptcha = vi.fn().mockResolvedValue("valid-recaptcha-token");
    vi.mocked(authService.verifyCaptcha).mockResolvedValue(true as any);

    render(<Register />);
    fillValidRegistrationForm();

    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(mockExecuteRecaptcha).toHaveBeenCalledWith("register");
      expect(authService.createEmailVerificationChallenge).toHaveBeenCalledWith(
        "test@example.com",
        "valid-recaptcha-token",
      );
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });
  });

  it("obtains a fresh reCAPTCHA token before resending an OTP", async () => {
    mockExecuteRecaptcha = vi
      .fn()
      .mockResolvedValueOnce("initial-recaptcha-token")
      .mockResolvedValueOnce("resend-recaptcha-token");
    vi.mocked(authService.createEmailVerificationChallenge).mockResolvedValue({
      data: {
        EC: 0,
        EM: "OTP sent",
        DT: {
          challengeId: "test-challenge-uuid",
          expiresInSeconds: 300,
          resendAfterSeconds: -1,
        },
      },
    } as any);

    render(<Register />);
    fillValidRegistrationForm();
    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("resend-otp-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("resend-otp-btn"));

    await waitFor(() => {
      expect(mockExecuteRecaptcha).toHaveBeenNthCalledWith(2, "register");
      expect(authService.createEmailVerificationChallenge).toHaveBeenNthCalledWith(
        2,
        "test@example.com",
        "resend-recaptcha-token",
      );
    });
  });

  it("fails closed when executeRecaptcha throws an exception (provider/network error)", async () => {
    mockRecaptchaEnabled = true;
    mockExecuteRecaptcha = vi.fn().mockRejectedValue(new Error("reCAPTCHA network timeout"));

    render(<Register />);
    fillValidRegistrationForm();

    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(mockExecuteRecaptcha).toHaveBeenCalledWith("register");
      expect(toast.error).toHaveBeenCalledWith("Xác minh reCAPTCHA thất bại");
    });

    // CRITICAL: Must FAIL CLOSED — must NOT request challenge or transition to OTP
    expect(authService.createEmailVerificationChallenge).not.toHaveBeenCalled();
    expect(screen.queryByTestId("otp-input")).not.toBeInTheDocument();
  });

  it("fails closed when executeRecaptcha is null (script not loaded yet)", async () => {
    mockRecaptchaEnabled = true;
    mockExecuteRecaptcha = null;

    render(<Register />);
    fillValidRegistrationForm();

    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("reCAPTCHA chưa sẵn sàng, vui lòng thử lại sau giây lát");
    });

    expect(authService.createEmailVerificationChallenge).not.toHaveBeenCalled();
    expect(screen.queryByTestId("otp-input")).not.toBeInTheDocument();
  });
});
