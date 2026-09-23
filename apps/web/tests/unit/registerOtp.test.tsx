import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockDispatch = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock("../../src/store/hooks", () => ({
  useAppDispatch: () => mockDispatch,
}));

vi.mock("react-google-recaptcha-v3", () => ({
  useGoogleReCaptcha: () => ({
    executeRecaptcha: vi.fn().mockResolvedValue("test-token"),
  }),
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
import * as userService from "../../src/services/userService";

describe("Register component OTP flow", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.mocked(authService.verifyCaptcha).mockResolvedValue(true as any);
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

    vi.mocked(authService.verifyEmailChallenge).mockResolvedValue({
      data: {
        EC: 0,
        EM: "Verified",
        DT: {
          verificationToken: "one-time-token-abc",
          expiresInSeconds: 600,
        },
      },
    } as any);

    vi.mocked(userService.registerNewUser).mockResolvedValue({
      data: {
        EC: 0,
        EM: "User created",
        DT: {},
      },
    } as any);
  });

  it("renders form initially and transitions to OTP step upon requesting challenge", async () => {
    render(<Register />);

    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Phone")).toBeInTheDocument();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "customer1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });

    // Click register button to request OTP
    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(authService.createEmailVerificationChallenge).toHaveBeenCalledWith(
        "customer@example.com",
        "test-token"
      );
    });

    // Verify transition to OTP step
    await waitFor(() => {
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });

    expect(screen.getByText(/customer@example.com/)).toBeInTheDocument();
  });

  it("verifies OTP and completes registration with one-time token", async () => {
    render(<Register />);

    // Fill and submit form to reach OTP step
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "customer1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });

    // Enter 6-digit OTP
    fireEvent.change(screen.getByTestId("otp-input"), {
      target: { value: "123456" },
    });

    // Click verify & complete
    fireEvent.click(screen.getByTestId("verify-otp-btn"));

    await waitFor(() => {
      expect(authService.verifyEmailChallenge).toHaveBeenCalledWith(
        "test-challenge-uuid",
        "123456"
      );
      expect(userService.registerNewUser).toHaveBeenCalledWith(
        "customer@example.com",
        "0901234567",
        "customer1",
        "password123",
        "one-time-token-abc"
      );
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("allows going back to edit form and retains inputs", async () => {
    render(<Register />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "edit@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0987654321" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "edituser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });

    // Click back button
    fireEvent.click(screen.getByTestId("back-to-form-btn"));

    // Form inputs should be visible and retain their values
    expect(screen.getByPlaceholderText("Email")).toHaveValue("edit@example.com");
    expect(screen.getByPlaceholderText("Phone")).toHaveValue("0987654321");
    expect(screen.getByPlaceholderText("Username")).toHaveValue("edituser");
  });

  it("blocks submission and shows errors when password is less than 8 characters", async () => {
    render(<Register />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "shortpass@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "validuser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "1234567" }, // 7 chars, less than min 8
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "1234567" },
    });

    fireEvent.click(screen.getByTestId("request-otp-btn"));

    expect(authService.createEmailVerificationChallenge).not.toHaveBeenCalled();
    expect(screen.getByText(/Mật khẩu phải từ 8 đến 128 ký tự/i)).toBeInTheDocument();
  });

  it("blocks submission when username is less than 3 characters", async () => {
    render(<Register />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "shortuser@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "ab" }, // 2 chars, less than min 3
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });

    fireEvent.click(screen.getByTestId("request-otp-btn"));

    expect(authService.createEmailVerificationChallenge).not.toHaveBeenCalled();
    expect(screen.getByText(/Tên người dùng phải từ 3 đến 100 ký tự/i)).toBeInTheDocument();
  });

  it("shows remaining attempts when OTP verification fails", async () => {
    vi.mocked(authService.verifyEmailChallenge).mockResolvedValue({
      data: {
        EC: 1,
        EM: "Mã không đúng",
        DT: { attemptsRemaining: 4 },
      },
    } as any);

    render(<Register />);

    // Fill and submit form
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "customer@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "customer1" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });

    // Enter wrong OTP
    fireEvent.change(screen.getByTestId("otp-input"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByTestId("verify-otp-btn"));

    await waitFor(() => {
      expect(screen.getByText(/Mã không đúng. Bạn còn 4 lần thử./i)).toBeInTheDocument();
    });
    expect(userService.registerNewUser).not.toHaveBeenCalled();
  });

  it("handles retryable registration failure and allows retrying with the same token", async () => {
    // First registration attempt fails with server error
    vi.mocked(userService.registerNewUser)
      .mockResolvedValueOnce({
        data: { EC: -2, EM: "Something wrongs in service..." },
      } as any)
      .mockResolvedValueOnce({
        data: { EC: 0, EM: "A user is created successfully" },
      } as any);

    render(<Register />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "retry@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "retryuser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("otp-input"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByTestId("verify-otp-btn"));

    // Should transition to REGISTRATION_FAILED with retry button
    await waitFor(() => {
      expect(screen.getByTestId("retry-register-btn")).toBeInTheDocument();
    });

    // Click retry button: should call registerNewUser with same token
    fireEvent.click(screen.getByTestId("retry-register-btn"));

    await waitFor(() => {
      expect(userService.registerNewUser).toHaveBeenCalledTimes(2);
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("handles non-retryable registration failure (email exists) and allows returning to form", async () => {
    vi.mocked(userService.registerNewUser).mockResolvedValue({
      data: { EC: 1, EM: "The email is already exist" },
    } as any);

    render(<Register />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "exists@example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Phone"), {
      target: { value: "0901234567" },
    });
    fireEvent.change(screen.getByPlaceholderText("Username"), {
      target: { value: "existsuser" },
    });
    fireEvent.change(screen.getByPlaceholderText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("request-otp-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("otp-input")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId("otp-input"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByTestId("verify-otp-btn"));

    await waitFor(() => {
      expect(screen.getByText(/The email is already exist/i)).toBeInTheDocument();
      expect(screen.queryByTestId("retry-register-btn")).not.toBeInTheDocument();
      expect(screen.getByTestId("return-to-form-btn")).toBeInTheDocument();
    });

    // Return to form to fix email
    fireEvent.click(screen.getByTestId("return-to-form-btn"));

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toHaveValue("exists@example.com");
    });
  });
});
